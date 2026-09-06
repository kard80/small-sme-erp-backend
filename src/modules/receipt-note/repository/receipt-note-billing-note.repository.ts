import { ClientSession, Types } from 'mongoose';
import { ReceiptNoteBillingNoteModel } from '../schema';

interface CreateReceiptNoteBillingNoteInput {
  receiptNoteId: Types.ObjectId;
  billingNoteIds: Types.ObjectId[];
}

class ReceiptNoteBillingNoteRepository {
  find(filter: { receiptNoteId: Types.ObjectId }) {
    return ReceiptNoteBillingNoteModel.find(filter).lean();
  }

  listReceiptedBillingNoteIds(billingNoteIds?: (Types.ObjectId | string)[]): Promise<Types.ObjectId[]> {
    return ReceiptNoteBillingNoteModel.distinct(
      'billingNoteId',
      billingNoteIds ? { billingNoteId: { $in: billingNoteIds } } : {}
    );
  }

  async isBillingNoteReceipted(billingNoteId: string): Promise<boolean> {
    const match = await ReceiptNoteBillingNoteModel.exists({ billingNoteId });
    return match !== null;
  }

  create(input: CreateReceiptNoteBillingNoteInput, session?: ClientSession) {
    const items = input.billingNoteIds.map((billingNoteId) => ({
      receiptNoteId: input.receiptNoteId,
      billingNoteId
    }));
    return ReceiptNoteBillingNoteModel.insertMany(items, { session });
  }

  deleteByReceiptNoteId(receiptNoteId: string, session?: ClientSession) {
    return ReceiptNoteBillingNoteModel.deleteMany({ receiptNoteId, deletedAt: null }, { session });
  }
}

export const receiptNoteBillingNoteRepository = new ReceiptNoteBillingNoteRepository();
