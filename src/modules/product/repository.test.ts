import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductModel } from '../../shared/persistence';
import { productRepository } from './repository';

afterEach(() => vi.restoreAllMocks());

const chain = (result: unknown) => {
  const q: any = {};
  for (const m of ['sort', 'skip', 'limit', 'session', 'lean']) q[m] = vi.fn(() => q);
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
};


describe('productRepository', () => {
  it('create drops unknown fields', async () => {
    const create = vi.spyOn(ProductModel, 'create').mockResolvedValue([{ toObject: () => ({}) }] as never);
    await productRepository.create({ productName: 'a', evil: 1 } as any);
    expect((create.mock.calls[0][0] as any[])[0]).not.toHaveProperty('evil');
  });

  it('update whitelists fields and skips undefined values but keeps 0', () => {
    const update = vi.spyOn(ProductModel, 'findOneAndUpdate').mockReturnValue(chain(null));
    productRepository.update('id', { sellPrice: 0, remark: undefined, evil: 1 } as any);
    expect(update.mock.calls[0][1]).toEqual({ $set: { sellPrice: 0 } });
  });

  it('remove marks inactive and reports whether it matched', async () => {
    vi.spyOn(ProductModel, 'updateOne').mockReturnValue(chain({ matchedCount: 1 }));
    expect(await productRepository.remove('id')).toBe(true);
    vi.spyOn(ProductModel, 'updateOne').mockReturnValue(chain({ matchedCount: 0 }));
    expect(await productRepository.remove('id')).toBe(false);
  });
});
