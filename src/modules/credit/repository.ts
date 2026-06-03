import { ClientSession, Types } from 'mongoose';
import { CustomerCreditModel } from '../../shared/persistence';
import { CustomerCredit, EntityPatch, NewEntity } from '../../shared/types';
import { pickDefined } from '../../shared/utils';

const toObjectId = (value: string | Types.ObjectId) => (value instanceof Types.ObjectId ? value : new Types.ObjectId(value));

const toCustomerCreditCreateDoc = (input: NewEntity<CustomerCredit, never>) => ({
  orderId: input.orderId,
  customerId: input.customerId,
  deliveryNote: input.deliveryNote,
  customerBillName: input.customerBillName,
  dueDate: input.dueDate,
  totalAmount: input.totalAmount,
  paidAmount: input.paidAmount,
  status: input.status
});

const toCustomerCreditUpdateDoc = (input: EntityPatch<CustomerCredit, never>) => pickDefined(input);

export const creditRepository = {
  async create(input: NewEntity<CustomerCredit, never>, session?: ClientSession) {
    const [credit] = await CustomerCreditModel.create([toCustomerCreditCreateDoc(input)], { session });
    return credit.toObject();
  },

  async list(page: number, pageSize: number) {
    const [data, total] = await Promise.all([
      CustomerCreditModel.find({ deletedAt: null })
        .sort({ _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<CustomerCredit[]>(),
      CustomerCreditModel.countDocuments({ deletedAt: null })
    ]);

    return { data, page, pageSize, total };
  },

  findById(_id: string, session?: ClientSession) {
    return CustomerCreditModel.findOne({ _id, deletedAt: null }).session(session ?? null).lean<CustomerCredit | null>();
  },

  findByOrderId(orderId: string, session?: ClientSession) {
    return CustomerCreditModel.findOne({ orderId: toObjectId(orderId), deletedAt: null }).session(session ?? null).lean<CustomerCredit | null>();
  },

  listByOrderId(orderId: string) {
    return CustomerCreditModel.find({ orderId: toObjectId(orderId), deletedAt: null }).sort({ _id: 1 }).lean<CustomerCredit[]>();
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
    return CustomerCreditModel.findOneAndUpdate(
      { _id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { returnDocument: 'before' }
    ).session(session ?? null).lean<CustomerCredit | null>();
  },

  async removeByOrderId(orderId: string, session?: ClientSession) {
    const orderObjectId = toObjectId(orderId);
    const deletedAt = new Date();
    const removed = await CustomerCreditModel.find({ orderId: orderObjectId, deletedAt: null })
      .session(session ?? null)
      .sort({ _id: 1 })
      .lean<CustomerCredit[]>();
    await CustomerCreditModel.updateMany(
      { orderId: orderObjectId, deletedAt: null },
      { $set: { deletedAt } }
    ).session(session ?? null);
    return removed;
  }
};
