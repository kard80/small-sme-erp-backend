import { ClientSession } from 'mongoose';
import { CustomerModel, nextSequence } from '../../shared/persistence';
import { Customer, EntityPatch, NewEntity } from '../../shared/types';

export const customersRepository = {
  async create(input: NewEntity<Customer, 'customerId'>, session?: ClientSession) {
    const [customer] = await CustomerModel.create(
      [
        {
          customerId: await nextSequence('customers', session),
          ...input
        }
      ],
      { session }
    );
    return customer.toObject();
  },

  list() {
    return CustomerModel.find().sort({ customerId: 1 }).lean<Customer[]>();
  },

  findById(id: number) {
    return CustomerModel.findOne({ customerId: id }).lean<Customer | null>();
  },

  update(id: number, input: EntityPatch<Customer, 'customerId'>, session?: ClientSession) {
    return CustomerModel.findOneAndUpdate(
      { customerId: id },
      { $set: input },
      { new: true, runValidators: true }
    ).session(session ?? null).lean<Customer | null>();
  },

  async remove(id: number, session?: ClientSession) {
    const result = await CustomerModel.deleteOne({ customerId: id }).session(session ?? null);
    return result.deletedCount > 0;
  }
};
