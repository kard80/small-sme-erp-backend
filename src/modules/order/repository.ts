import { ClientSession } from 'mongoose';
import { OrderModel, OrderOcrUploadBatchModel } from '../../shared/persistence';
import { EntityPatch, NewEntity, Order, OrderOcrUploadBatch } from '../../shared/types';
import { pickDefined } from '../../shared/utils';

const toOrderCreateDoc = (input: NewEntity<Order, never>) => ({
  customerId: input.customerId,
  customerBillName: input.customerBillName,
  customerBillAddress: input.customerBillAddress,
  totalAmount: input.totalAmount,
  dueDate: input.dueDate,
  deliveryDate: input.deliveryDate,
  deliveryNote: input.deliveryNote,
  completedAt: input.completedAt,
  cancelledAt: input.cancelledAt
});

export const orderRepository = {
  async create(input: NewEntity<Order, never>, session?: ClientSession) {
    const [order] = await OrderModel.create([toOrderCreateDoc(input)], { session });
    return order.toObject();
  },

  async list(page: number, pageSize: number) {
    const [data, total] = await Promise.all([
      OrderModel.find({ deletedAt: null }).sort({ _id: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean<Order[]>(),
      OrderModel.countDocuments({ deletedAt: null })
    ]);

    return { data, page, pageSize, total };
  },

  findById(_id: string, session?: ClientSession) {
    return OrderModel.findOne({ _id, deletedAt: null }).session(session ?? null).lean<Order | null>();
  },

  update(_id: string, input: EntityPatch<Order, never>, session?: ClientSession) {
    return OrderModel.findOneAndUpdate(
      { _id },
      { $set: pickDefined(input) },
      { returnDocument: 'after', runValidators: true }
    )
      .lean<Order | null>()
      .session(session ?? null);
  },

  async createOcrUploadBatch(
    input: Pick<OrderOcrUploadBatch, 'folderName' | 'filenames' | 'objectKeys' | 'createdAt'>,
    session?: ClientSession
  ) {
    const [batch] = await OrderOcrUploadBatchModel.create(
      [
        {
          folderName: input.folderName,
          filenames: input.filenames,
          objectKeys: input.objectKeys,
          createdAt: input.createdAt
        }
      ],
      { session }
    );

    return batch.toObject();
  },

  remove(_id: string, session?: ClientSession) {
    return OrderModel.findOneAndUpdate(
      { _id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { returnDocument: 'before' }
    ).session(session ?? null).lean<Order | null>();
  }
};
