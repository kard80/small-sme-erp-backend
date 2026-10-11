import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrderModel } from '../../../shared/persistence';
import { orderRepository } from './order.repository';
import { ComparableFilter } from '../../../shared/filters';
import { Pagination } from '../../../shared/pagination';

afterEach(() => vi.restoreAllMocks());

const chain = (result: unknown) => {
  const q: any = {};
  for (const m of ['sort', 'skip', 'limit', 'session', 'lean']) q[m] = vi.fn(() => q);
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
};


describe('orderRepository', () => {
  it('create drops unknown fields', async () => {
    const spy = vi.spyOn(OrderModel, 'create').mockResolvedValue([{ toObject: () => ({}) }] as never);
    await orderRepository.create({ totalAmount: 1, deletedAt: new Date(), isAdmin: true } as any);
    const doc = (spy.mock.calls[0][0] as any[])[0];
    expect(doc).not.toHaveProperty('isAdmin');
    expect(doc).not.toHaveProperty('deletedAt');
    expect(doc.totalAmount).toBe(1);
  });

  it('update strips undefined fields from $set', () => {
    const update = vi.spyOn(OrderModel, 'findOneAndUpdate').mockReturnValue(chain(null));
    orderRepository.update('id', { remark: undefined, totalAmount: 5 });
    expect(update.mock.calls[0][1]).toEqual({ $set: { totalAmount: 5 } });
  });

  it('list excludes deleted and maps filters to mongo operators', async () => {
    const find = vi.spyOn(OrderModel, 'find').mockReturnValue(chain([]));
    vi.spyOn(OrderModel, 'countDocuments').mockResolvedValue(0 as never);
    await orderRepository.list({
      pagination: new Pagination(),
      where: { deliveryNote: new ComparableFilter({ $ne: null }), customerId: new ComparableFilter({ $eq: 'c' }) }
    });
    expect(find.mock.calls[0][0]).toEqual({ deletedAt: null, deliveryNote: { $ne: null }, customerId: 'c' });
  });

  it('list sorts by deliveryDate desc by default and lets callers override', async () => {
    const cursor = chain([]);
    vi.spyOn(OrderModel, 'find').mockReturnValue(cursor);
    vi.spyOn(OrderModel, 'countDocuments').mockResolvedValue(0 as never);
    await orderRepository.list({ pagination: new Pagination() });
    expect(cursor.sort).toHaveBeenLastCalledWith({ deliveryDate: -1, _id: -1 });
    await orderRepository.list({ pagination: new Pagination(), sort: { deliveryNote: 1 } });
    expect(cursor.sort).toHaveBeenLastCalledWith({ deliveryNote: 1 });
  });

  it('list applies skip/limit only when paginated', async () => {
    const cursor = chain([]);
    vi.spyOn(OrderModel, 'find').mockReturnValue(cursor);
    vi.spyOn(OrderModel, 'countDocuments').mockResolvedValue(0 as never);
    await orderRepository.list({ pagination: new Pagination() });
    expect(cursor.skip).not.toHaveBeenCalled();
    await orderRepository.list({ pagination: new Pagination(2, 5) });
    expect(cursor.skip).toHaveBeenCalledWith(5);
    expect(cursor.limit).toHaveBeenCalledWith(5);
  });

  it('remove sets deletedAt instead of deleting', () => {
    const update = vi.spyOn(OrderModel, 'findOneAndUpdate').mockReturnValue(chain(null));
    orderRepository.remove('id');
    expect(update.mock.calls[0][1]).toMatchObject({ $set: { deletedAt: expect.any(Date) } });
  });

  it('getSummary limits to completed, uncancelled orders and returns zeros when empty', async () => {
    const agg = vi.spyOn(OrderModel, 'aggregate').mockResolvedValue([] as never);
    const result = await orderRepository.getSummary('2026-01-01', '2026-01-31');
    expect(result).toEqual({ revenue: 0, expenses: 0 });
    const match = (agg.mock.calls[0][0] as any[])[0].$match;
    expect(match).toMatchObject({ deletedAt: null, cancelledAt: null, completedAt: { $ne: null } });
    expect(match.deliveryDate.$lte.getTime()).toBeGreaterThan(match.deliveryDate.$gte.getTime());
  });
});
