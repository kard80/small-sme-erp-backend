import { productSchema } from './schemas';
import { productRepository } from './repository';

export const productService = {
  createProduct(input: Parameters<typeof productRepository.create>[0]) {
    return productRepository.create(input);
  },

  listProducts(page: number, pageSize: number) {
    return productRepository.list(page, pageSize);
  },

  updateProduct(id: number, input: Parameters<typeof productRepository.update>[1]) {
    return productRepository.update(id, input);
  },

  removeProduct(id: number) {
    return productRepository.remove(id);
  },

  async importProducts(rows: Array<Array<string | number | undefined>>) {
    const created = [];
    for (const row of rows) {
      const [productName, unit, defaultBuyPrice, sellPrice, status] = row;
      const parsed = productSchema.safeParse({ productName, unit, defaultBuyPrice, sellPrice, status });
      if (!parsed.success) {
        continue;
      }

      created.push(await productRepository.create(parsed.data));
    }

    return {
      inserted: created.length,
      data: created
    };
  }
};
