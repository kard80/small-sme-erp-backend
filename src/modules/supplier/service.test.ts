import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/persistence', () => ({
  runInTransaction: vi.fn((work: (s: unknown) => unknown) => work({}))
}));
vi.mock('./repository', () => ({
  suppliersRepository: { findById: vi.fn(), findByIds: vi.fn() },
  productSuppliersRepository: {
    findByProductId: vi.fn(),
    findBySupplierId: vi.fn(),
    findActiveProductsByIds: vi.fn(),
    replaceForProduct: vi.fn(),
    replaceForSupplier: vi.fn()
  }
}));

import { BadRequestError, NotFoundError } from '../../shared/errors';
import { productSuppliersRepository as links, suppliersRepository } from './repository';
import { supplierService } from './service';

const a = 'a'.repeat(24);
const b = 'b'.repeat(24);

beforeEach(() => {
  vi.resetAllMocks();
  links.findByProductId.mockResolvedValue([]);
  links.findBySupplierId.mockResolvedValue([]);
  suppliersRepository.findByIds.mockResolvedValue([]);
});

describe('supplierService', () => {
  it('replaceSuppliersOfProduct 404s on missing product', async () => {
    links.findActiveProductsByIds.mockResolvedValue([]);
    await expect(supplierService.replaceSuppliersOfProduct(a, [])).rejects.toBeInstanceOf(NotFoundError);
    expect(links.replaceForProduct).not.toHaveBeenCalled();
  });

  it('replaceSuppliersOfProduct 400s on unknown supplier', async () => {
    links.findActiveProductsByIds.mockResolvedValue([{ _id: a }]);
    suppliersRepository.findByIds.mockResolvedValue([]);
    await expect(supplierService.replaceSuppliersOfProduct(a, [{ supplierId: b, priority: 1 }])).rejects.toBeInstanceOf(BadRequestError);
    expect(links.replaceForProduct).not.toHaveBeenCalled();
  });

  it('replaceSuppliersOfProduct replaces links on success', async () => {
    links.findActiveProductsByIds.mockResolvedValue([{ _id: a }]);
    suppliersRepository.findByIds.mockResolvedValue([{ _id: b }]);
    await supplierService.replaceSuppliersOfProduct(a, [{ supplierId: b, priority: 1 }]);
    expect(links.replaceForProduct).toHaveBeenCalledWith(a, [{ supplierId: b, priority: 1 }], {});
  });

  it('replaceProductsOfSupplier 404s on missing supplier', async () => {
    suppliersRepository.findById.mockResolvedValue(null);
    await expect(supplierService.replaceProductsOfSupplier(a, [])).rejects.toBeInstanceOf(NotFoundError);
  });

  it('replaceProductsOfSupplier 400s on unknown/inactive product', async () => {
    suppliersRepository.findById.mockResolvedValue({ _id: a });
    links.findActiveProductsByIds.mockResolvedValue([]);
    await expect(supplierService.replaceProductsOfSupplier(a, [{ productId: b, priority: 1 }])).rejects.toBeInstanceOf(BadRequestError);
    expect(links.replaceForSupplier).not.toHaveBeenCalled();
  });

  it('listProductsOfSupplier 404s on missing supplier', async () => {
    suppliersRepository.findById.mockResolvedValue(null);
    await expect(supplierService.listProductsOfSupplier(a)).rejects.toBeInstanceOf(NotFoundError);
  });
});
