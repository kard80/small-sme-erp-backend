import { ClientSession } from 'mongoose';
import { Pagination } from '../../../shared/pagination';
import { ReceiptNote, ReceiptNoteModel } from '../schema';

export interface CreateReceiptNoteInput {
  customerId: string;
  receiptDate: Date;
  totalAmount: number;
}

class ReceiptNoteRepository {
  findById(receiptNoteId: string) {
    return ReceiptNoteModel.findOne({ _id: receiptNoteId, deletedAt: null }).lean<ReceiptNote | null>();
  }

  async list(startDate: Date, endDate: Date, customerId?: string, pagination: Pagination = new Pagination()) {
    const query = {
      deletedAt: null,
      ...(customerId ? { customerId } : {}),
      receiptDate: { $gte: startDate, $lte: endDate }
    };

    const { page, pageSize, skip } = pagination;
    const cursor = ReceiptNoteModel.find(query).sort({ receiptDate: 1 });
    if (skip !== undefined && pageSize) {
      cursor.skip(skip).limit(pageSize);
    }

    const [data, total] = await Promise.all([cursor.lean<ReceiptNote[]>(), ReceiptNoteModel.countDocuments(query)]);

    return { data, page: page ?? 1, pageSize: pageSize ?? total, total };
  }

  createReceiptNote(input: CreateReceiptNoteInput, session?: ClientSession) {
    const item = {
      customerId: input.customerId,
      receiptDate: input.receiptDate,
      totalAmount: input.totalAmount
    };
    return ReceiptNoteModel.insertOne(item, { session });
  }

  setDocumentNumber(receiptNoteId: string, documentNumber: string, session?: ClientSession) {
    return ReceiptNoteModel.findOneAndUpdate(
      { _id: receiptNoteId, deletedAt: null },
      { documentNumber },
      { new: true, session }
    ).lean<ReceiptNote | null>();
  }

  deleteReceiptNote(receiptNoteId: string, session?: ClientSession) {
    return ReceiptNoteModel.deleteMany({ _id: receiptNoteId, deletedAt: null }, { session });
  }
}

export const receiptNoteRepository = new ReceiptNoteRepository();
