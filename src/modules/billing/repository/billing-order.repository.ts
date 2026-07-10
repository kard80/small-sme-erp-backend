import { ClientSession, Types } from 'mongoose';
import { BillingNoteOrderModel } from '../schema';

interface CreateBillingOrderInput {
  billingNoteId: Types.ObjectId;
  orderIds: Types.ObjectId[];
}
class BillingOrderRepository {
  find(filter: { billingNoteId: Types.ObjectId}) {
    return BillingNoteOrderModel.find(filter).lean();
  }
  create(input: CreateBillingOrderInput, session?: ClientSession) {
    const items = input.orderIds.map((orderId) => ({
      billingNoteId: input.billingNoteId,
      orderId: orderId
    }));
    return BillingNoteOrderModel.insertMany(items, { session });
  }
}

export const billingOrderRepository = new BillingOrderRepository();
