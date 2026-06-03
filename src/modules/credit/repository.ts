import { ClientSession, Types } from 'mongoose';
import { CustomerCreditModel } from '../../shared/persistence';
import { CustomerCredit, EntityPatch, NewEntity } from '../../shared/types';

const toObjectId = (value: string | Types.ObjectId) => (value instanceof Types.ObjectId ? value : new Types.ObjectId(value));

const toCustomerCreditCreateDoc = (input: NewEntity<CustomerCredit, never>) => ({
  orderId: toObjectId(input.orderId),
  customerId: toObjectId(input.customerId),
  deliveryNote: input.deliveryNote,
  customerBillName: input.customerBillName,
  dueDate: input.dueDate,
  totalAmount: input.totalAmount,
  paidAmount: input.paidAmount,
  status: input.status
});

const toCustomerCreditUpdateDoc = (input: EntityPatch<CustomerCredit, never>) => {
  const update: Partial<Omit<CustomerCredit, '_id'>> = {};

  if (input.orderId !== undefined) {
    update.orderId = toObjectId(input.orderId);
  }
  if (input.customerId !== undefined) {
    update.customerId = toObjectId(input.customerId);
  }
  if (input.deliveryNote !== undefined) {
    update.deliveryNote = input.deliveryNote;
  }
  if (input.customerBillName !== undefined) {
    update.customerBillName = input.customerBillName;
  }
  if (input.dueDate !== undefined) {
    update.dueDate = input.dueDate;
  }
  if (input.totalAmount !== undefined) {
    update.totalAmount = input.totalAmount;
  }
  if (input.paidAmount !== undefined) {
    update.paidAmount = input.paidAmount;
  }
  if (input.status !== undefined) {
    update.status = input.status;
  }

  return update;
};

export const creditRepository = {
  async create(input: NewEntity<CustomerCredit, never>, session?: ClientSession) {
    const [credit] = await CustomerCreditModel.create([toCustomerCreditCreateDoc(input)], { session });
    return credit.toObject();
  },

  list() {
    return CustomerCreditModel.find().sort({ _id: 1 }).lean<CustomerCredit[]>();
  },

  findById(_id: string, session?: ClientSession) {
    return CustomerCreditModel.findOne({ _id }).session(session ?? null).lean<CustomerCredit | null>();
  },

  findByOrderId(orderId: string, session?: ClientSession) {
    return CustomerCreditModel.findOne({ orderId: toObjectId(orderId) }).session(session ?? null).lean<CustomerCredit | null>();
  },

  listByOrderId(orderId: string) {
    return CustomerCreditModel.find({ orderId: toObjectId(orderId) }).sort({ _id: 1 }).lean<CustomerCredit[]>();
  },

  update(_id: string, input: EntityPatch<CustomerCredit, never>, session?: ClientSession) {
    return CustomerCreditModel.findOneAndUpdate(
      { _id },
      { $set: toCustomerCreditUpdateDoc(input) },
      { returnDocument: 'after', runValidators: true }
    ).lean<
      CustomerCredit | null
    >().session(session ?? null);
  },

  remove(_id: string, session?: ClientSession) {
    return CustomerCreditModel.findOneAndDelete({ _id }).session(session ?? null).lean<CustomerCredit | null>();
  },

  async removeByOrderId(orderId: string, session?: ClientSession) {
    const orderObjectId = toObjectId(orderId);
    const removed = await CustomerCreditModel.find({ orderId: orderObjectId })
      .session(session ?? null)
      .sort({ _id: 1 })
      .lean<CustomerCredit[]>();
    await CustomerCreditModel.deleteMany({ orderId: orderObjectId }).session(session ?? null);
    return removed;
  }
};
