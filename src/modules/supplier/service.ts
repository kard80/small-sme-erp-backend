import { BadRequestError, NotFoundError } from '../../shared/errors';
import { runInTransaction } from '../../shared/persistence';
import { productSuppliersRepository as links, suppliersRepository } from './repository';

const missing = (ids: string[], found: Array<{ _id: unknown }>) => {
  const foundIds = new Set(found.map((f) => String(f._id)));
  return ids.filter((id) => !foundIds.has(id));
};

export const supplierService = {
  createSupplier(input: Parameters<typeof suppliersRepository.create>[0]) {
    return suppliersRepository.create(input);
  },

  listSuppliers(page: number, pageSize: number) {
    return suppliersRepository.list(page, pageSize);
  },

  getSupplier(_id: string) {
    return suppliersRepository.findById(_id);
  },

  updateSupplier(_id: string, input: Parameters<typeof suppliersRepository.update>[1]) {
    return suppliersRepository.update(_id, input);
  },

  removeSupplier(_id: string) {
    return suppliersRepository.remove(_id);
  },

  async listSuppliersOfProduct(productId: string) {
    const rows = await links.findByProductId(productId);
    const suppliers = await suppliersRepository.findByIds(rows.map((r) => String(r.supplierId)));
    const byId = new Map(suppliers.map((s) => [String(s._id), s]));
    return rows.flatMap((r) => {
      const supplier = byId.get(String(r.supplierId));
      return supplier ? [{ supplier, priority: r.priority, condition: r.condition }] : [];
    });
  },

  async listProductsOfSupplier(supplierId: string) {
    if (!(await suppliersRepository.findById(supplierId))) {
      throw new NotFoundError('ไม่พบผู้ขาย');
    }
    const rows = await links.findBySupplierId(supplierId);
    const products = await links.findActiveProductsByIds(rows.map((r) => String(r.productId)));
    const byId = new Map(products.map((p) => [String(p._id), p]));
    return rows.flatMap((r) => {
      const product = byId.get(String(r.productId));
      return product ? [{ product, priority: r.priority, condition: r.condition }] : [];
    });
  },

  replaceSuppliersOfProduct(
    productId: string,
    input: Array<{ supplierId: string; priority: number; condition?: { note?: string } }>
  ) {
    return runInTransaction(async (session) => {
      if ((await links.findActiveProductsByIds([productId], session)).length === 0) {
        throw new NotFoundError('ไม่พบสินค้า');
      }
      const found = await suppliersRepository.findByIds(input.map((i) => i.supplierId), session);
      if (missing(input.map((i) => i.supplierId), found).length) {
        throw new BadRequestError('ไม่พบผู้ขายบางรายการ');
      }
      await links.replaceForProduct(productId, input, session);
    }).then(() => supplierService.listSuppliersOfProduct(productId));
  },

  async replaceProductsOfSupplier(
    supplierId: string,
    input: Array<{ productId: string; priority: number; condition?: { note?: string } }>
  ) {
    await runInTransaction(async (session) => {
      if (!(await suppliersRepository.findById(supplierId, session))) {
        throw new NotFoundError('ไม่พบผู้ขาย');
      }
      const found = await links.findActiveProductsByIds(input.map((i) => i.productId), session);
      if (missing(input.map((i) => i.productId), found).length) {
        throw new BadRequestError('ไม่พบสินค้าบางรายการ');
      }
      await links.replaceForSupplier(supplierId, input, session);
    });
    return supplierService.listProductsOfSupplier(supplierId);
  }
};
