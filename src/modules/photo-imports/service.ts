import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { BadRequestError, ConflictError, HttpError, NotFoundError } from '../../shared/errors';
import {
  correctionDepartmentBucketName,
  createSignedObjectDownloadUrl,
  downloadObjectFromBucket,
  uploadObjectToBucket
} from '../../shared/gcs';
import { logger } from '../../shared/logger';
import { PhotoImportLine } from '../../shared/types';
import { productRepository } from '../product/repository';
import { readOrderLines } from './claude';
import { photoImportRepository } from './repository';
import { ClaudeLines, detectImageType, imageExtension } from './schemas';

const uploadsPerHour = 30;
// Must exceed the Claude worst case (120s timeout x 2 attempts) plus GCS/DB time, or live imports get swept.
const staleAfterMs = 10 * 60 * 1000;
const maxCatalogProducts = 3000;

// Messages safe to show clients; anything else is stored as a generic message.
class ImportError extends Error {}
const imageUrlExpiresSeconds = 15 * 60;

type CatalogEntry = { productName: string; unit: string };

const normUnit = (unit: string) => unit.trim().toLowerCase();

const buildCatalog = async () => {
  const products = await productRepository.listActiveCatalog();
  const byId = new Map<string, CatalogEntry>(
    products.map((p) => [String(p._id), { productName: p.productName, unit: p.unit }])
  );
  logger.info({ catalogSize: products.length }, 'photo import catalog loaded');
  if (products.length > maxCatalogProducts) {
    throw new ImportError('catalog too large');
  }
  const text = products.map((p) => `${p._id} | ${p.productName} | ${p.unit}`).join('\n');
  return { byId, text };
};

// Never trust Claude's ids or flags: ids must exist in the catalog, unitMismatch is recomputed here.
export const normalizeLines = (raw: ClaudeLines, catalog: Map<string, CatalogEntry>): PhotoImportLine[] =>
  raw.lines.flatMap((line) => {
    if (!line.rawText) {
      return [];
    }
    const product = line.productId ? catalog.get(line.productId) : undefined;
    const productId = product && line.productId ? new Types.ObjectId(line.productId) : null;
    const seen = new Set<string>(productId ? [String(productId)] : []);
    const alternatives: PhotoImportLine['alternatives'] = [];
    for (const alt of line.alternatives) {
      const entry = catalog.get(alt.productId);
      if (entry && !seen.has(alt.productId) && alternatives.length < 2) {
        seen.add(alt.productId);
        alternatives.push({ productId: new Types.ObjectId(alt.productId), productName: entry.productName });
      }
    }

    const qtyOk = Number.isFinite(line.qty) && line.qty > 0;

    return [{
      rawText: line.rawText,
      qty: qtyOk ? line.qty : 0,
      unit: line.unit,
      productId,
      confidence: !qtyOk || (line.productId && !product) ? 'low' : line.confidence,
      alternatives,
      unitMismatch: product ? normUnit(line.unit) !== normUnit(product.unit) : false
    }];
  });

// Standalone on purpose so the trigger can later become a Cloud Tasks handler.
// Callers await it inside the request: Cloud Run only gives CPU while a request is open.
export const processImport = async (id: string, uploaded?: Buffer): Promise<void> => {
  try {
    const doc = await photoImportRepository.findById(id);
    if (!doc || doc.status !== 'processing') {
      return;
    }

    const image = uploaded ?? await downloadObjectFromBucket(correctionDepartmentBucketName, doc.imageKey);
    const mediaType = detectImageType(image);
    if (!mediaType) {
      throw new ImportError('unsupported image type');
    }

    const catalog = await buildCatalog();
    const raw = await readOrderLines(image, mediaType, catalog.text);
    const lines = normalizeLines(raw, catalog.byId);
    if (lines.length === 0) {
      throw new ImportError('no order lines found in image');
    }
    await photoImportRepository.markReady(id, lines);
  } catch (error) {
    logger.error({ err: error, photoImportId: id }, 'photo import failed');
    await photoImportRepository
      .markFailed(id, error instanceof ImportError ? error.message : 'processing failed')
      .catch((err) => logger.error({ err }, 'could not mark photo import failed'));
  }
};

// processImport never throws, so the doc is 'ready' or 'failed' by now.
const currentStatus = async (id: string) => (await photoImportRepository.findById(id))?.status ?? 'failed';

const assertUnderHourlyCap = async (userId: string) => {
  const recent = await photoImportRepository.countSince(userId, new Date(Date.now() - 60 * 60 * 1000));
  if (recent >= uploadsPerHour) {
    throw new HttpError('อัปโหลดเกินจำนวนที่กำหนดต่อชั่วโมง', 429);
  }
};

export const photoImportsService = {
  async upload(userId: string, file: { buffer: Buffer; mimetype: string } | undefined) {
    if (!file) {
      throw new BadRequestError('กรุณาแนบรูปภาพ');
    }
    const type = detectImageType(file.buffer);
    if (!type || type !== file.mimetype) {
      throw new BadRequestError('รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP');
    }

    await assertUnderHourlyCap(userId);

    const imageKey = `photo-imports/${randomUUID()}.${imageExtension[type]}`;
    await uploadObjectToBucket(correctionDepartmentBucketName, imageKey, file.buffer, type);
    const doc = await photoImportRepository.create({ userId, imageKey });
    const id = String(doc._id);

    await processImport(id, file.buffer);
    return { id, status: await currentStatus(id) };
  },

  async list(userId: string, status?: Parameters<typeof photoImportRepository.listByUser>[1]) {
    const docs = await photoImportRepository.listByUser(userId, status);
    return docs.map((d) => ({
      id: String(d._id),
      status: d.status,
      createdAt: d.createdAt,
      lineCount: d.lines?.length ?? 0
    }));
  },

  async get(userId: string, id: string) {
    const doc = await photoImportRepository.findOwned(id, userId);
    if (!doc) {
      throw new NotFoundError('ไม่พบรายการนำเข้า');
    }
    const { downloadUrl } = await createSignedObjectDownloadUrl({
      bucketName: correctionDepartmentBucketName,
      objectKey: doc.imageKey,
      expiresInSeconds: imageUrlExpiresSeconds
    });
    return {
      id: String(doc._id),
      status: doc.status,
      imageUrl: downloadUrl,
      lines: doc.lines,
      error: doc.error ?? null,
      createdAt: doc.createdAt
    };
  },

  async retry(userId: string, id: string) {
    await assertUnderHourlyCap(userId);
    await transitionOrThrow(userId, id, 'failed', 'processing', new Date(Date.now() - staleAfterMs));
    await processImport(id);
    return { id, status: await currentStatus(id) };
  },

  async consume(userId: string, id: string) {
    await transitionOrThrow(userId, id, 'ready', 'consumed');
    return { id, status: 'consumed' as const };
  },

  // Boot sweep: anything stuck in 'processing' lost its worker when the process died.
  failInterrupted() {
    return photoImportRepository.failStale(new Date(Date.now() - staleAfterMs), 'interrupted');
  }
};

const transitionOrThrow = async (
  userId: string,
  id: string,
  from: Parameters<typeof photoImportRepository.transition>[2],
  to: Parameters<typeof photoImportRepository.transition>[3],
  staleBefore?: Date
) => {
  if (!(await photoImportRepository.transition(id, userId, from, to, staleBefore))) {
    // Distinguish missing/foreign (404) from wrong state (409).
    if (!(await photoImportRepository.findOwned(id, userId))) {
      throw new NotFoundError('ไม่พบรายการนำเข้า');
    }
    throw new ConflictError(`ทำรายการนี้ได้เฉพาะสถานะ ${from}`);
  }
};
