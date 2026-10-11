import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerModel } from '../../shared/persistence';
import { customersRepository } from './repository';

afterEach(() => vi.restoreAllMocks());

const chain = (result: unknown) => {
  const q: any = {};
  for (const m of ['sort', 'skip', 'limit', 'session', 'lean']) q[m] = vi.fn(() => q);
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
};


describe('customersRepository', () => {
  it('remove soft-deletes', () => {
    const update = vi.spyOn(CustomerModel, 'findOneAndUpdate').mockReturnValue(chain(null));
    customersRepository.remove('id');
    expect(update.mock.calls[0][1]).toMatchObject({ $set: { deletedAt: expect.any(Date) } });
  });
});
