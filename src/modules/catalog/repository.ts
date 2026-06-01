import { db, nextProductId, paginate } from '../../shared/store';
import { Product } from '../../shared/types';

export const catalogRepository = {
  create(input: Omit<Product, 'id'>) {
    const product = { id: nextProductId(), ...input };
    db.products.push(product);
    return product;
  },

  list(page: number, pageSize: number) {
    return paginate(db.products, page, pageSize);
  },

  findById(id: number) {
    return db.products.find((item) => item.id === id);
  },

  update(id: number, input: Partial<Omit<Product, 'id'>>) {
    const product = this.findById(id);
    if (!product) {
      return undefined;
    }

    Object.assign(product, input);
    return product;
  },

  remove(id: number) {
    const idx = db.products.findIndex((item) => item.id === id);
    if (idx < 0) {
      return false;
    }

    db.products.splice(idx, 1);
    return true;
  }
};
