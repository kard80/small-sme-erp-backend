import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictError } from '../../shared/errors';
import { SupplierModel } from '../../shared/persistence';
import { suppliersRepository } from './repository';

afterEach(() => vi.restoreAllMocks());

const chain = (result: unknown) => {
  const q: any = {};
  for (const m of ['session', 'lean']) q[m] = vi.fn(() => q);
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject);
  return q;
};
const dup = Object.assign(new Error('E11000'), { code: 11000 });

describe('suppliersRepository', () => {
  it('update unsets phone/remark on empty string and leaves omitted fields alone', async () => {
    const update = vi.spyOn(SupplierModel, 'findOneAndUpdate').mockReturnValue(chain({}));
    await suppliersRepository.update('id', { phone: '', remark: 'r' });
    expect(update.mock.calls[0][1]).toEqual({ $set: { remark: 'r' }, $unset: { phone: 1 } });
  });

  it('create treats empty strings as absent', async () => {
    const create = vi.spyOn(SupplierModel, 'create').mockResolvedValue([{ toObject: () => ({}) }] as any);
    await suppliersRepository.create({ supplierName: 'A', phone: '', remark: '' });
    expect(create.mock.calls[0][0]).toEqual([{ supplierName: 'A' }]);
  });

  it('maps E11000 to ConflictError on create and update', async () => {
    vi.spyOn(SupplierModel, 'create').mockRejectedValue(dup);
    await expect(suppliersRepository.create({ supplierName: 'A' })).rejects.toBeInstanceOf(ConflictError);
    vi.spyOn(SupplierModel, 'findOneAndUpdate').mockReturnValue(chain(dup));
    await expect(suppliersRepository.update('id', { supplierName: 'A' })).rejects.toThrow('ชื่อผู้ขายนี้มีอยู่แล้ว');
  });

  it('rethrows other errors untouched', async () => {
    const boom = new Error('boom');
    vi.spyOn(SupplierModel, 'create').mockRejectedValue(boom);
    await expect(suppliersRepository.create({ supplierName: 'A' })).rejects.toBe(boom);
  });
});
