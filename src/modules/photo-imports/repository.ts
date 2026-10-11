import { PhotoImportModel } from '../../shared/persistence';
import { PhotoImport, PhotoImportLine, PhotoImportStatus } from '../../shared/types';

const toLineDoc = (line: PhotoImportLine) => ({
  rawText: line.rawText,
  qty: line.qty,
  unit: line.unit,
  productId: line.productId,
  confidence: line.confidence,
  alternatives: line.alternatives.map((a) => ({ productId: a.productId, productName: a.productName })),
  unitMismatch: line.unitMismatch
});

const notDeleted = { deletedAt: null };

export const photoImportRepository = {
  async create(input: { userId: string; imageKey: string }) {
    const doc = await PhotoImportModel.create({
      userId: input.userId,
      imageKey: input.imageKey,
      status: 'processing',
      processingAt: new Date()
    });
    return doc.toObject() as PhotoImport;
  },

  findById(id: string) {
    return PhotoImportModel.findOne({ _id: id, ...notDeleted }).lean<PhotoImport | null>();
  },

  findOwned(id: string, userId: string) {
    return PhotoImportModel.findOne({ _id: id, userId, ...notDeleted }).lean<PhotoImport | null>();
  },

  listByUser(userId: string, status?: PhotoImportStatus) {
    return PhotoImportModel.find({ userId, ...(status ? { status } : {}), ...notDeleted })
      .sort({ createdAt: -1 })
      .select('status createdAt lines.rawText')
      .lean<Pick<PhotoImport, '_id' | 'status' | 'createdAt' | 'lines'>[]>();
  },

  // processingAt is reset by every retry, so a retry counts as a fresh attempt (ceiling: repeated retries of one doc count once).
  countSince(userId: string, since: Date) {
    return PhotoImportModel.countDocuments({ userId, processingAt: { $gte: since }, ...notDeleted });
  },

  // Atomic state transition: only applies when the owner's import is currently in `from`.
  // staleBefore additionally lets a 'processing' doc older than that through (its worker is gone).
  transition(id: string, userId: string, from: PhotoImportStatus, to: PhotoImportStatus, staleBefore?: Date) {
    const set: Record<string, unknown> = { status: to };
    if (to === 'processing') {
      set.error = null;
      set.lines = [];
      set.processingAt = new Date();
    }
    return PhotoImportModel.findOneAndUpdate(
      {
        _id: id,
        userId,
        ...(staleBefore
          ? { $or: [{ status: from }, { status: 'processing', processingAt: { $lt: staleBefore } }] }
          : { status: from }),
        ...notDeleted
      },
      { $set: set },
      { new: true }
    ).lean<PhotoImport | null>();
  },

  async markReady(id: string, lines: PhotoImportLine[]) {
    await PhotoImportModel.updateOne(
      { _id: id, status: 'processing' },
      { $set: { status: 'ready', error: null, lines: lines.map(toLineDoc) } }
    );
  },

  async markFailed(id: string, error: string) {
    await PhotoImportModel.updateOne({ _id: id, status: 'processing' }, { $set: { status: 'failed', error } });
  },

  async failStale(cutoff: Date, error: string) {
    const result = await PhotoImportModel.updateMany(
      { status: 'processing', processingAt: { $lt: cutoff }, ...notDeleted },
      { $set: { status: 'failed', error } }
    );
    return result.modifiedCount;
  }
};
