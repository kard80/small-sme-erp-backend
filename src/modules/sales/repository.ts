import { ClientSession } from 'mongoose';
import { OrderModel, nextSequence } from '../../shared/persistence';
import { CreateOrderInput, EntityPatch, Order } from '../../shared/types';

export const orderRepository = {
  async create(input: CreateOrderInput, session?: ClientSession) {
    const [order] = await OrderModel.create(
      [
        {
          id: await nextSequence('orders', session),
          ...input
        }
      ],
      { session }
    );
    return order.toObject();
  },

  async list(page: number, pageSize: number) {
    const [data, total] = await Promise.all([
      OrderModel.find().sort({ id: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean<Order[]>(),
      OrderModel.countDocuments()
    ]);

    return { data, page, pageSize, total };
  },

  findById(id: number, session?: ClientSession) {
    return OrderModel.findOne({ id }).session(session ?? null).lean<Order | null>();
  },

  update(id: number, input: EntityPatch<Order, 'id'>, session?: ClientSession) {
    return OrderModel.findOneAndUpdate({ id }, { $set: input }, { new: true, runValidators: true }).lean<
      Order | null
    >().session(session ?? null);
  },

  remove(id: number, session?: ClientSession) {
    return OrderModel.findOneAndDelete({ id }).session(session ?? null).lean<Order | null>();
  }
};
