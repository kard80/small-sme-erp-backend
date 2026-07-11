import { ClientSession } from 'mongoose';
import { Pagination } from '../../../shared/pagination';
import { BillingNote, BillingNoteModel } from '../schema';

export interface CreateBillingNoteInput {
  customerId: string;
  issuedDate: Date;
  totalAmount: number;
}

class BillingNoteRepository {
  findById(billingNoteId: string) {
    return BillingNoteModel.findOne({ _id: billingNoteId, deletedAt: null }).lean<BillingNote | null>();
  }

  async list(startDate: Date, endDate: Date, customerId?: string, pagination: Pagination = new Pagination()) {
    const query = {
      deletedAt: null,
      ...(customerId ? { customerId } : {}),
      issuedDate: { $gte: startDate, $lte: endDate }
    };

    const { page, pageSize, skip } = pagination;
    const cursor = BillingNoteModel.find(query).sort({ issuedDate: 1 });
    if (skip !== undefined && pageSize) {
      cursor.skip(skip).limit(pageSize);
    }

    const [data, total] = await Promise.all([cursor.lean<BillingNote[]>(), BillingNoteModel.countDocuments(query)]);

    return { data, page: page ?? 1, pageSize: pageSize ?? total, total };
  }

  createBillingNote(input: CreateBillingNoteInput, session?: ClientSession) {
    const item = {
      customerId: input.customerId,
      issuedDate: input.issuedDate,
      totalAmount: input.totalAmount
    };
    return BillingNoteModel.insertOne(item, { session });
  }

  setDocumentNumber(billingNoteId: string, documentNumber: string, session?: ClientSession) {
    return BillingNoteModel.findOneAndUpdate(
      { _id: billingNoteId, deletedAt: null },
      { documentNumber },
      { new: true, session }
    ).lean<BillingNote | null>();
  }

  deleteBillingNote(billingNoteId: string, session?: ClientSession) {
    return BillingNoteModel.deleteMany({ _id: billingNoteId, deletedAt: null }, { session });
  }
}

export const billingNoteRepository = new BillingNoteRepository();
