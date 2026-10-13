import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExpenseModel } from '../../shared/persistence';
import { expensesRepository } from './repository';

afterEach(() => vi.restoreAllMocks());

const chain = (result: unknown) => {
  const q: any = {};
  for (const m of ['session', 'lean']) q[m] = vi.fn(() => q);
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
};
const d = new Date('2026-01-02T00:00:00.000Z');

describe('expensesRepository', () => {
  it('update whitelists fields and unsets note on empty string', async () => {
    const update = vi.spyOn(ExpenseModel, 'findOneAndUpdate').mockReturnValue(chain({}));
    await expensesRepository.update('id', { amount: 5, note: '', evil: 1 } as any);
    expect(update.mock.calls[0][1]).toEqual({ $set: { amount: 5 }, $unset: { note: 1 } });
  });

  it('create whitelists fields and treats empty note as absent', async () => {
    const create = vi.spyOn(ExpenseModel, 'create').mockResolvedValue([{ toObject: () => ({}) }] as any);
    await expensesRepository.create({ item: 'a', amount: 1, note: '', expenseDate: d, evil: 1 } as any);
    expect(create.mock.calls[0][0]).toEqual([{ item: 'a', amount: 1, expenseDate: d }]);
  });

  it('list sorts by expenseDate then createdAt desc, excluding deleted', async () => {
    const find: any = chain([]);
    find.sort = vi.fn(() => find); find.skip = vi.fn(() => find); find.limit = vi.fn(() => find);
    const spy = vi.spyOn(ExpenseModel, 'find').mockReturnValue(find);
    vi.spyOn(ExpenseModel, 'countDocuments').mockResolvedValue(0 as any);
    await expensesRepository.list(2, 5);
    expect(spy).toHaveBeenCalledWith({ deletedAt: null });
    expect(find.sort).toHaveBeenCalledWith({ expenseDate: -1, createdAt: -1 });
    expect(find.skip).toHaveBeenCalledWith(5);
  });

  it('remove soft-deletes', async () => {
    const upd = vi.spyOn(ExpenseModel, 'findOneAndUpdate').mockReturnValue(chain({}));
    await expensesRepository.remove('id');
    expect((upd.mock.calls[0][1] as any).$set.deletedAt).toBeInstanceOf(Date);
  });
});
