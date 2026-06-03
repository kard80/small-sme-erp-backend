import { ClientSession } from 'mongoose';
import { PaymentTransactionModel } from '../../shared/persistence';
import { NewEntity, PaymentTransaction } from '../../shared/types';

export const financeRepository = {
  async create(input: NewEntity<PaymentTransaction, never>, session?: ClientSession) {
    const [payment] = await PaymentTransactionModel.create([input], { session });
    return payment.toObject();
  },

  list() {
    return PaymentTransactionModel.find().sort({ _id: 1 }).lean<PaymentTransaction[]>();
  },

  findById(_id: string, session?: ClientSession) {
    return PaymentTransactionModel.findOne({ _id }).session(session ?? null).lean<PaymentTransaction | null>();
  },

  update(_id: string, input: NewEntity<PaymentTransaction, never>, session?: ClientSession) {
    return PaymentTransactionModel.findOneAndUpdate(
      { _id },
      { $set: input },
      { returnDocument: 'after', runValidators: true }
    ).session(session ?? null).lean<PaymentTransaction | null>();
  },

  remove(_id: string, session?: ClientSession) {
    return PaymentTransactionModel.findOneAndDelete({ _id }).session(session ?? null).lean<PaymentTransaction | null>();
  },

  async removeByCreditId(customerCreditId: string, session?: ClientSession) {
    await PaymentTransactionModel.deleteMany({ customerCreditId }).session(session ?? null);
  }
};
