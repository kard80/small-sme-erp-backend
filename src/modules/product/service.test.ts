import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./repository', () => ({
  productRepository: {
    findByProductNameAndUnit: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn()
  },
  unitRepository: { list: vi.fn() }
}));
vi.mock('../order/services/order-item', () => ({
  orderItemService: { findProductHistory: vi.fn() }
}));

import { productService } from './service';
import { productRepository } from './repository';
import { orderItemService } from '../order/services/order-item';
import { BadRequestError } from '../../shared/errors';

const repo = vi.mocked(productRepository);

beforeEach(() => vi.resetAllMocks());

describe('productService.createProduct', () => {
  it('rejects a duplicate name+unit', async () => {
    repo.findByProductNameAndUnit.mockResolvedValue({ _id: 'x' } as any);
    await expect(
      productService.createProduct({ productName: 'a', unit: 'kg', sellPrice: 1 } as any)
    ).rejects.toThrow(BadRequestError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('creates when name+unit is free', async () => {
    repo.findByProductNameAndUnit.mockResolvedValue(null as any);
    repo.create.mockResolvedValue({ _id: 'n' } as any);
    await productService.createProduct({ productName: 'a', unit: 'kg', sellPrice: 1 } as any);
    expect(repo.create).toHaveBeenCalled();
  });
});

describe('productService.updateProduct', () => {
  it('allows keeping the same name+unit on the same product', async () => {
    repo.findById.mockResolvedValue({ productName: 'a', unit: 'kg' } as any);
    repo.findByProductNameAndUnit.mockResolvedValue({ _id: { toString: () => 'p1' } } as any);
    await productService.updateProduct('p1', { productName: 'a' } as any);
    expect(repo.update).toHaveBeenCalled();
  });

  it('rejects renaming onto another product', async () => {
    repo.findById.mockResolvedValue({ productName: 'a', unit: 'kg' } as any);
    repo.findByProductNameAndUnit.mockResolvedValue({ _id: { toString: () => 'other' } } as any);
    await expect(productService.updateProduct('p1', { productName: 'b' } as any)).rejects.toThrow(BadRequestError);
  });

  it('skips the uniqueness check when name/unit are untouched', async () => {
    await productService.updateProduct('p1', { sellPrice: 5 } as any);
    expect(repo.findByProductNameAndUnit).not.toHaveBeenCalled();
  });
});

describe('productService.importProducts', () => {
  it('reports invalid rows, in-file duplicates and existing products; creates the rest', async () => {
    repo.findByProductNameAndUnit.mockImplementation(async (name: string) =>
      name === 'exists' ? ({ _id: 'e' } as any) : (null as any)
    );
    repo.create.mockImplementation(async (d: any) => ({ _id: d.productName, ...d }) as any);

    const result = await productService.importProducts([
      ['ok', 'kg', 1, 2],
      ['ok', 'kg', 1, 2],
      ['exists', 'kg', 1, 2],
      ['bad', 'kg', 1, -5],
      ['', 'kg', 1, 2]
    ]);

    expect(result.inserted).toBe(1);
    expect(result.failed).toHaveLength(4);
    expect(result.failed[0].reason).toContain('ซ้ำ');
    expect(result.failed[2].reason).toContain('sellPrice');
  });

  it('records a failure when create throws and keeps going', async () => {
    repo.findByProductNameAndUnit.mockResolvedValue(null as any);
    repo.create.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce({ _id: '2' } as any);
    const result = await productService.importProducts([
      ['a', 'kg', 1, 2],
      ['b', 'kg', 1, 2]
    ]);
    expect(result.inserted).toBe(1);
    expect(result.failed[0].reason).toBe('db down');
  });
});

describe('productService.getProductOrderHistory', () => {
  it('requires page and pageSize', async () => {
    await expect(
      productService.getProductOrderHistory({
        productId: 'p',
        page: 0,
        pageSize: 10,
        deliveryStartDate: '2026-01-01',
        deliveryEndDate: '2026-01-31'
      })
    ).rejects.toThrow(BadRequestError);
  });

  it('forwards a date range and pagination', async () => {
    await productService.getProductOrderHistory({
      productId: 'p',
      page: 2,
      pageSize: 10,
      deliveryStartDate: '2026-01-01',
      deliveryEndDate: '2026-01-31'
    });
    const arg = vi.mocked(orderItemService.findProductHistory).mock.calls[0][0] as any;
    expect(arg.pagination.skip).toBe(10);
    expect(arg.deliveryDateRange.start).toBeInstanceOf(Date);
  });
});
