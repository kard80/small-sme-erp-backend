import { ClientSession } from 'mongoose';
import { OrderModel, OrderOcrUploadBatchModel } from '../../shared/persistence';
import { EntityPatch, NewEntity, Order, OrderOcrUploadBatch } from '../../shared/types';

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

const toOrderUpdateDoc = (input: EntityPatch<Order, never>) => {
  const update: Partial<Omit<Order, '_id'>> = {};

  if (input.customerId !== undefined) {
    update.customerId = input.customerId;
  }
  if (input.customerBillName !== undefined) {
    update.customerBillName = input.customerBillName;
  }
  if (input.customerBillAddress !== undefined) {
    update.customerBillAddress = input.customerBillAddress;
  }
  if (input.totalAmount !== undefined) {
    update.totalAmount = input.totalAmount;
  }
  if (input.dueDate !== undefined) {
    update.dueDate = input.dueDate;
  }
  if (input.deliveryDate !== undefined) {
    update.deliveryDate = input.deliveryDate;
  }
  if (input.deliveryNote !== undefined) {
    update.deliveryNote = input.deliveryNote;
  }
  if (input.completedAt !== undefined) {
    update.completedAt = input.completedAt;
  }
  if (input.cancelledAt !== undefined) {
    update.cancelledAt = input.cancelledAt;
  }

  return update;
};

export const orderRepository = {
  async create(input: NewEntity<Order, never>, session?: ClientSession) {
    const [order] = await OrderModel.create([toOrderCreateDoc(input)], { session });
    return order.toObject();
  },

  async list(page: number, pageSize: number) {
    const [data, total] = await Promise.all([
      OrderModel.find().sort({ _id: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean<Order[]>(),
      OrderModel.countDocuments()
    ]);

    return { data, page, pageSize, total };
  },

  findById(_id: string, session?: ClientSession) {
    return OrderModel.findOne({ _id }).session(session ?? null).lean<Order | null>();
  },

  update(_id: string, input: EntityPatch<Order, never>, session?: ClientSession) {
    return OrderModel.findOneAndUpdate(
      { _id },
      { $set: toOrderUpdateDoc(input) },
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
    return OrderModel.findOneAndDelete({ _id }).session(session ?? null).lean<Order | null>();
  }
};
