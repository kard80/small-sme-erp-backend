import { ClientSession } from 'mongoose';
import { BillingNote, BillingNoteModel } from '../schema';

export interface CreateBillingNoteInput {
  customerId: string;
  issuedDate: Date;
  totalAmount: number;
}

class BillingRepository {
  findById(billingNoteId: string) {
    return BillingNoteModel.findOne({ _id: billingNoteId, deletedAt: null }).lean<BillingNote | null>();
  }

  createBillingNote(input: CreateBillingNoteInput, session?: ClientSession) {
    const item = {
      customerId: input.customerId,
      issuedDate: input.issuedDate,
      totalAmount: input.totalAmount
    };
    return BillingNoteModel.insertOne(item, { session });
  }
}

export const billingRepository = new BillingRepository();
