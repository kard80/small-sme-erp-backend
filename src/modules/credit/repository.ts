import { ClientSession } from 'mongoose';
import { CustomerCreditModel, nextSequence } from '../../shared/persistence';
import { CustomerCredit } from '../../shared/types';

export const creditRepository = {
  async create(input: Omit<CustomerCredit, 'id'>, session?: ClientSession) {
    const [credit] = await CustomerCreditModel.create(
      [
        {
          id: await nextSequence('customerCredits', session),
          ...input
        }
      ],
      { session }
    );
    return credit.toObject();
  },

  list() {
    return CustomerCreditModel.find().sort({ id: 1 }).lean<CustomerCredit[]>();
  },

  findById(id: number, session?: ClientSession) {
    return CustomerCreditModel.findOne({ id }).session(session ?? null).lean<CustomerCredit | null>();
  },

  findByOrderId(orderId: number, session?: ClientSession) {
    return CustomerCreditModel.findOne({ orderId }).session(session ?? null).lean<CustomerCredit | null>();
  },

  listByOrderId(orderId: number) {
    return CustomerCreditModel.find({ orderId }).sort({ id: 1 }).lean<CustomerCredit[]>();
  },

  update(id: number, input: Partial<Omit<CustomerCredit, 'id'>>, session?: ClientSession) {
    return CustomerCreditModel.findOneAndUpdate({ id }, { $set: input }, { new: true, runValidators: true }).lean<
      CustomerCredit | null
    >().session(session ?? null);
  },

  remove(id: number, session?: ClientSession) {
    return CustomerCreditModel.findOneAndDelete({ id }).session(session ?? null).lean<CustomerCredit | null>();
  },

  async removeByOrderId(orderId: number, session?: ClientSession) {
    const removed = await CustomerCreditModel.find({ orderId })
      .session(session ?? null)
      .sort({ id: 1 })
      .lean<CustomerCredit[]>();
    await CustomerCreditModel.deleteMany({ orderId }).session(session ?? null);
    return removed;
  }
};
