import { ClientSession } from 'mongoose';
import { CustomerCreditModel } from '../../shared/persistence';
import { CustomerCredit, EntityPatch, NewEntity } from '../../shared/types';

export const creditRepository = {
  async create(input: NewEntity<CustomerCredit, never>, session?: ClientSession) {
    const [credit] = await CustomerCreditModel.create([input], { session });
    return credit.toObject();
  },

  list() {
    return CustomerCreditModel.find().sort({ _id: 1 }).lean<CustomerCredit[]>();
  },

  findById(_id: string, session?: ClientSession) {
    return CustomerCreditModel.findOne({ _id }).session(session ?? null).lean<CustomerCredit | null>();
  },

  findByOrderId(orderId: string, session?: ClientSession) {
    return CustomerCreditModel.findOne({ orderId }).session(session ?? null).lean<CustomerCredit | null>();
  },

  listByOrderId(orderId: string) {
    return CustomerCreditModel.find({ orderId }).sort({ _id: 1 }).lean<CustomerCredit[]>();
  },

  update(_id: string, input: EntityPatch<CustomerCredit, never>, session?: ClientSession) {
    return CustomerCreditModel.findOneAndUpdate(
      { _id },
      { $set: input },
      { returnDocument: 'after', runValidators: true }
    ).lean<
      CustomerCredit | null
    >().session(session ?? null);
  },

  remove(_id: string, session?: ClientSession) {
    return CustomerCreditModel.findOneAndDelete({ _id }).session(session ?? null).lean<CustomerCredit | null>();
  },

  async removeByOrderId(orderId: string, session?: ClientSession) {
    const removed = await CustomerCreditModel.find({ orderId })
      .session(session ?? null)
      .sort({ _id: 1 })
      .lean<CustomerCredit[]>();
    await CustomerCreditModel.deleteMany({ orderId }).session(session ?? null);
    return removed;
  }
};
