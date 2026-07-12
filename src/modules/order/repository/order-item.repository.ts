import { ClientSession, Types } from 'mongoose';
import { collectionNames, OrderItemModel } from '../../../shared/persistence';
import { CreateOrderItemInput, OrderItem } from '../../../shared/types';
import { Currency } from '../../../shared/currency';
import { Pagination } from '../../../shared/pagination';

const toOrderItemCreateDoc = (
  orderId: string,
  itemOrder: number,
  input: CreateOrderItemInput,
  timestamps: Pick<OrderItem, 'completedAt'>
) => ({
  orderId: new Types.ObjectId(orderId),
  order: itemOrder,
  productId: new Types.ObjectId(input.productId),
  productName: input.productName,
  unit: input.unit,
  quantity: input.quantity,
  buyPrice: input.buyPrice,
  sellPrice: input.sellPrice,
  totalSellPrice: new Currency(input.sellPrice).multiply(input.quantity).toNumber(),
  totalBuyPrice: new Currency(input.buyPrice).multiply(input.quantity).toNumber(),
  completedAt: timestamps.completedAt
});

export interface FindProductHistoryOptions {
  productId: string;
  deliveryDateRange?: { start?: Date; end?: Date };
  pagination: Pagination;
}

export interface ProductHistoryEntry {
  orderItemId: string;
  orderId: string;
  customerBillName: string;
  deliveryDate: Date;
  deliveryNote?: string;
  unit: string;
  quantity: number;
  totalBuyPrice: number;
  totalSellPrice: number;
}

export const orderItemRepository = {
  async findProductHistory(options: FindProductHistoryOptions) {
    const { productId, deliveryDateRange, pagination } = options;
    const { page, pageSize, skip } = pagination;

    const orderMatch: Record<string, unknown> = {
      'order.deletedAt': null,
      'order.completedAt': { $ne: null }
    };
    if (deliveryDateRange?.start || deliveryDateRange?.end) {
      const range: Record<string, unknown> = {};
      if (deliveryDateRange.start) range.$gte = deliveryDateRange.start;
      if (deliveryDateRange.end) range.$lte = deliveryDateRange.end;
      orderMatch['order.deliveryDate'] = range;
    }

    const [result] = await OrderItemModel.aggregate<{
      data: ProductHistoryEntry[];
      totalCount: Array<{ count: number }>;
    }>([
      { $match: { productId: new Types.ObjectId(productId), deletedAt: null } },
      {
        $lookup: {
          from: collectionNames.order,
          localField: 'orderId',
          foreignField: '_id',
          as: 'order'
        }
      },
      { $unwind: '$order' },
      { $match: orderMatch },
      { $sort: { 'order.deliveryDate': -1 } },
      {
        $facet: {
          data: [
            ...(skip !== undefined && pageSize ? [{ $skip: skip }, { $limit: pageSize }] : []),
            {
              $project: {
                _id: 0,
                orderItemId: { $toString: '$_id' },
                orderId: { $toString: '$order._id' },
                customerBillName: '$order.customerBillName',
                deliveryDate: '$order.deliveryDate',
                deliveryNote: '$order.deliveryNote',
                unit: 1,
                quantity: 1,
                totalBuyPrice: 1,
                totalSellPrice: 1
              }
            }
          ],
          totalCount: [{ $count: 'count' }]
        }
      }
    ]);

    const total = result?.totalCount[0]?.count ?? 0;
    return { data: result?.data ?? [], page: page ?? 1, pageSize: pageSize ?? total, total };
  },

  async createMany(
    orderId: string,
    items: CreateOrderItemInput[],
    timestamps: Pick<OrderItem, 'completedAt'>,
    session?: ClientSession
  ) {
    const docs = items.map((item, index) => toOrderItemCreateDoc(orderId, index + 1, item, timestamps));
    const created = await OrderItemModel.create(docs, { session, ordered: true });
    return created.map((item) => item.toObject());
  },

  listByOrderId(orderId: string, session?: ClientSession) {
    return OrderItemModel.find({ orderId, deletedAt: null })
      .sort({ order: 1 })
      .session(session ?? null)
      .lean<OrderItem[]>();
  },

  async updateLifecycleByOrderId(orderId: string, timestamps: Pick<OrderItem, 'completedAt'>, session?: ClientSession) {
    await OrderItemModel.updateMany(
      { orderId, deletedAt: null },
      {
        $set: {
          completedAt: timestamps.completedAt
        }
      },
      { runValidators: true }
    ).session(session ?? null);

    return this.listByOrderId(orderId, session);
  },

  async hardDeleteByOrderId(orderId: string, session?: ClientSession) {
    const removed = await OrderItemModel.find({ orderId })
      .session(session ?? null)
      .lean<OrderItem[]>();
    await OrderItemModel.deleteMany({ orderId }).session(session ?? null);
    return removed;
  },

  async removeByOrderId(orderId: string, session?: ClientSession) {
    const removed = await OrderItemModel.find({ orderId, deletedAt: null })
      .session(session ?? null)
      .sort({ order: 1 })
      .lean<OrderItem[]>();
    const deletedAt = new Date();
    await OrderItemModel.updateMany({ orderId, deletedAt: null }, { $set: { deletedAt } }).session(session ?? null);
    return removed;
  }
};
