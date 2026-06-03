import { ClientSession } from 'mongoose';
import { CustomerModel } from '../../shared/persistence';
import { Customer, EntityPatch, NewEntity } from '../../shared/types';

export const customersRepository = {
  async create(input: NewEntity<Customer, never>, session?: ClientSession) {
    const [customer] = await CustomerModel.create([input], { session });
    return customer.toObject();
  },

  async list(page: number, pageSize: number) {
    const [data, total] = await Promise.all([
      CustomerModel.find()
        .sort({ _id: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<Customer[]>(),
      CustomerModel.countDocuments({})
    ]);

    return { data, page, pageSize, total };
  },

  findById(_id: string, session?: ClientSession) {
    return CustomerModel.findOne({ _id }).session(session ?? null).lean<Customer | null>();
  },

  findByCustomerName(customerName: string) {
    return CustomerModel.findOne({ customerName }).lean<Customer | null>();
  },

  update(_id: string, input: EntityPatch<Customer, never>, session?: ClientSession) {
    return CustomerModel.findOneAndUpdate(
      { _id },
      { $set: input },
      { returnDocument: 'after', runValidators: true }
    ).session(session ?? null).lean<Customer | null>();
  },

  async remove(_id: string, session?: ClientSession) {
    const result = await CustomerModel.deleteOne({ _id }).session(session ?? null);
    return result.deletedCount > 0;
  }
};
