import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrderItemModel } from '../../../shared/persistence';
import { orderItemRepository } from './order-item.repository';
import { Pagination } from '../../../shared/pagination';

afterEach(() => vi.restoreAllMocks());

const chain = (result: unknown) => {
  const q: any = {};
  for (const m of ['sort', 'skip', 'limit', 'session', 'lean']) q[m] = vi.fn(() => q);
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
};


describe('orderItemRepository', () => {
  it('createMany numbers items from 1 and computes rounded line totals', async () => {
    const create = vi.spyOn(OrderItemModel, 'create').mockResolvedValue([] as never);
    const productId = new Types.ObjectId().toString();
    await orderItemRepository.createMany(
      new Types.ObjectId().toString(),
      [
        { productId, productName: 'a', unit: 'kg', quantity: 3, buyPrice: 1.1, sellPrice: 2.55 },
        { productId, productName: 'b', unit: 'kg', quantity: 1, buyPrice: 0, sellPrice: 1 }
      ],
      { completedAt: null }
    );
    const docs = create.mock.calls[0][0] as any[];
    expect(docs.map((d) => d.order)).toEqual([1, 2]);
    expect(docs[0]).toMatchObject({ totalSellPrice: 7.65, totalBuyPrice: 3.3 });
  });

  it('hardDeleteByOrderId really deletes while removeByOrderId only soft-deletes', async () => {
    vi.spyOn(OrderItemModel, 'find').mockReturnValue(chain([{}]));
    const del = vi.spyOn(OrderItemModel, 'deleteMany').mockReturnValue(chain({}));
    const upd = vi.spyOn(OrderItemModel, 'updateMany').mockReturnValue(chain({}));

    await orderItemRepository.hardDeleteByOrderId('o');
    expect(del).toHaveBeenCalled();
    expect(upd).not.toHaveBeenCalled();

    await orderItemRepository.removeByOrderId('o');
    expect(del).toHaveBeenCalledTimes(1);
    expect(upd.mock.calls[0][1]).toMatchObject({ $set: { deletedAt: expect.any(Date) } });
  });

  it('findProductHistory only counts completed, non-deleted orders and paginates', async () => {
    const agg = vi.spyOn(OrderItemModel, 'aggregate').mockResolvedValue([{ data: [{}], totalCount: [{ count: 11 }] }] as never);
    const result = await orderItemRepository.findProductHistory({
      productId: new Types.ObjectId().toString(),
      pagination: new Pagination(2, 10),
      deliveryDateRange: { start: new Date(0) }
    });
    const pipeline = agg.mock.calls[0][0] as any[];
    const orderMatch = pipeline.find((s) => s.$match?.['order.deletedAt'] === null).$match;
    expect(orderMatch['order.completedAt']).toEqual({ $ne: null });
    expect(orderMatch['order.deliveryDate']).toEqual({ $gte: new Date(0) });
    expect(JSON.stringify(pipeline)).toContain('"$skip":10');
    expect(result).toMatchObject({ page: 2, pageSize: 10, total: 11 });
  });

  it('findProductHistory returns an empty page when nothing matches', async () => {
    vi.spyOn(OrderItemModel, 'aggregate').mockResolvedValue([] as never);
    const result = await orderItemRepository.findProductHistory({
      productId: new Types.ObjectId().toString(),
      pagination: new Pagination()
    });
    expect(result).toEqual({ data: [], page: 1, pageSize: 0, total: 0 });
  });
});

