import { ClientSession, Types } from 'mongoose';
import { BillingNoteOrderModel } from '../schema';

interface CreateBillingNoteOrderInput {
  billingNoteId: Types.ObjectId;
  orderIds: Types.ObjectId[];
}
class BillingNoteOrderRepository {
  find(filter: { billingNoteId: Types.ObjectId }) {
    return BillingNoteOrderModel.find(filter).lean();
  }
  listBilledOrderIds(orderIds?: (Types.ObjectId | string)[]): Promise<Types.ObjectId[]> {
    return BillingNoteOrderModel.distinct('orderId', orderIds ? { orderId: { $in: orderIds } } : {});
  }
  async isOrderBilled(orderId: string): Promise<boolean> {
    const match = await BillingNoteOrderModel.exists({ orderId });
    return match !== null;
  }
  create(input: CreateBillingNoteOrderInput, session?: ClientSession) {
    const items = input.orderIds.map((orderId) => ({
      billingNoteId: input.billingNoteId,
      orderId: orderId
    }));
    return BillingNoteOrderModel.insertMany(items, { session });
  }

  deleteByBillingNoteId(billingNoteId: string, session?: ClientSession) {
    return BillingNoteOrderModel.deleteMany({ billingNoteId, deletedAt: null }, { session });
  }
}

export const billingNoteOrderRepository = new BillingNoteOrderRepository();
