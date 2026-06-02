import { ClientSession } from 'mongoose';
import {
  PaymentTransactionModel,
  nextSequence
} from '../../shared/persistence';
import { PaymentTransaction } from '../../shared/types';

export const financeRepository = {
  async create(input: Omit<PaymentTransaction, 'id'>, session?: ClientSession) {
    const [payment] = await PaymentTransactionModel.create(
      [
        {
          id: await nextSequence('financials', session),
          ...input
        }
      ],
      { session }
    );
    return payment.toObject();
  },

  list() {
    return PaymentTransactionModel.find().sort({ id: 1 }).lean<PaymentTransaction[]>();
  },

  findById(id: number, session?: ClientSession) {
    return PaymentTransactionModel.findOne({ id }).session(session ?? null).lean<PaymentTransaction | null>();
  },

  update(id: number, input: Omit<PaymentTransaction, 'id'>, session?: ClientSession) {
    return PaymentTransactionModel.findOneAndUpdate(
      { id },
      { $set: input },
      { new: true, runValidators: true }
    ).session(session ?? null).lean<PaymentTransaction | null>();
  },

  remove(id: number, session?: ClientSession) {
    return PaymentTransactionModel.findOneAndDelete({ id }).session(session ?? null).lean<PaymentTransaction | null>();
  },

  async removeByCreditId(customerCreditId: number, session?: ClientSession) {
    await PaymentTransactionModel.deleteMany({ customerCreditId }).session(session ?? null);
  }
};
