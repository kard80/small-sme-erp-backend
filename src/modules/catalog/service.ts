import { productSchema } from './schemas';
import { catalogRepository } from './repository';

export const catalogService = {
  createProduct(input: Parameters<typeof catalogRepository.create>[0]) {
    return catalogRepository.create(input);
  },

  listProducts(page: number, pageSize: number) {
    return catalogRepository.list(page, pageSize);
  },

  updateProduct(id: number, input: Parameters<typeof catalogRepository.update>[1]) {
    return catalogRepository.update(id, input);
  },

  removeProduct(id: number) {
    return catalogRepository.remove(id);
  },

  importProducts(rows: Array<Array<string | number | undefined>>) {
    const created = [];
    for (const row of rows) {
      const [productName, unit, defaultBuyPrice, defaultSellPrice] = row;
      const parsed = productSchema.safeParse({ productName, unit, defaultBuyPrice, defaultSellPrice });
      if (!parsed.success) {
        continue;
      }

      created.push(catalogRepository.create(parsed.data));
    }

    return {
      inserted: created.length,
      data: created
    };
  }
};
