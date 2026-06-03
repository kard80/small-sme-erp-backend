import { ClientSession, Types } from 'mongoose';
import { OrderItemModel } from '../../shared/persistence';
import { CreateOrderItemInput, OrderItem } from '../../shared/types';

const toOrderItemCreateDoc = async (
  orderId: string,
  itemOrder: number,
  input: CreateOrderItemInput,
  timestamps: Pick<OrderItem, 'completedAt' | 'cancelledAt'>
) => ({
  orderId: new Types.ObjectId(orderId),
  order: itemOrder,
  productId: new Types.ObjectId(input.productId),
  productName: input.productName,
  unit: input.unit,
  quantity: input.quantity,
  buyPrice: input.buyPrice,
  sellPrice: input.sellPrice,
  lineTotal: input.sellPrice * input.quantity,
  completedAt: timestamps.completedAt,
  cancelledAt: timestamps.cancelledAt
});

export const orderItemRepository = {
  async createMany(
    orderId: string,
    items: CreateOrderItemInput[],
    timestamps: Pick<OrderItem, 'completedAt' | 'cancelledAt'>,
    session?: ClientSession
  ) {
    const docs = await Promise.all(items.map((item, index) => toOrderItemCreateDoc(orderId, index + 1, item, timestamps)));
    const created = await OrderItemModel.create(docs, { session });
    return created.map((item) => item.toObject());
  },

  listByOrderId(orderId: string, session?: ClientSession) {
    return OrderItemModel.find({ orderId }).sort({ order: 1 }).session(session ?? null).lean<OrderItem[]>();
  },

  async updateLifecycleByOrderId(
    orderId: string,
    timestamps: Pick<OrderItem, 'completedAt' | 'cancelledAt'>,
    session?: ClientSession
  ) {
    await OrderItemModel.updateMany(
      { orderId },
      {
        $set: {
          completedAt: timestamps.completedAt,
          cancelledAt: timestamps.cancelledAt
        }
      },
      { runValidators: true }
    ).session(session ?? null);

    return this.listByOrderId(orderId, session);
  },

  async removeByOrderId(orderId: string, session?: ClientSession) {
    const removed = await OrderItemModel.find({ orderId })
      .session(session ?? null)
      .sort({ order: 1 })
      .lean<OrderItem[]>();
    await OrderItemModel.deleteMany({ orderId }).session(session ?? null);
    return removed;
  }
};
