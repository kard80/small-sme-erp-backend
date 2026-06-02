import type { ZodIssue } from 'zod';
import { BadRequestError } from '../../shared/errors';
import { importProductSchema } from './schemas';
import { productRepository } from './repository';

type ProductImportRow = Array<string | number | undefined>;

const formatRowReason = (issues: ZodIssue[]) =>
  issues
    .map((issue) => {
      const field = issue.path.length > 0 && typeof issue.path[0] !== 'symbol' ? String(issue.path[0]) : 'row';
      return `${field}: ${issue.message}`;
    })
    .join(', ');

const ensureProductNameAvailable = async (productName: string, excludedId?: string) => {
  const existingProduct = await productRepository.findByProductName(productName);
  if (existingProduct && existingProduct._id.toString() !== excludedId) {
    throw new BadRequestError('ชื่อสินค้ามีอยู่แล้ว');
  }
};

export const productService = {
  async createProduct(input: Parameters<typeof productRepository.create>[0]) {
    await ensureProductNameAvailable(input.productName);
    return productRepository.create(input);
  },

  listProducts(page: number, pageSize: number) {
    return productRepository.list(page, pageSize);
  },

  async updateProduct(id: string, input: Parameters<typeof productRepository.update>[1]) {
    if (input.productName !== undefined) {
      await ensureProductNameAvailable(input.productName, id);
    }

    return productRepository.update(id, input);
  },

  removeProduct(id: string) {
    return productRepository.remove(id);
  },

  async importProducts(rows: ProductImportRow[]) {
    const created = [];
    const failed: Array<{
      row: ProductImportRow;
      productName?: string;
      reason: string;
    }> = [];
    const importedProductNames = new Set<string>();

    for (const row of rows) {
      const [productName, unit, defaultBuyPrice, sellPrice, status] = row;
      const parsed = importProductSchema.safeParse({
        productName,
        unit,
        defaultBuyPrice,
        sellPrice,
        status: status ?? 'active'
      });
      if (!parsed.success) {
        failed.push({
          row,
          productName: typeof productName === 'string' ? productName : undefined,
          reason: formatRowReason(parsed.error.issues)
        });
        continue;
      }

      if (importedProductNames.has(parsed.data.productName)) {
        failed.push({
          row,
          productName: parsed.data.productName,
          reason: 'พบชื่อสินค้าซ้ำในไฟล์นำเข้า'
        });
        continue;
      }

      const existingProduct = await productRepository.findByProductName(parsed.data.productName);
      if (existingProduct) {
        failed.push({
          row,
          productName: parsed.data.productName,
          reason: 'ชื่อสินค้ามีอยู่แล้ว'
        });
        continue;
      }

      try {
        created.push(await productRepository.create(parsed.data));
        importedProductNames.add(parsed.data.productName);
      } catch (error) {
        failed.push({
          row,
          productName: parsed.data.productName,
          reason: error instanceof Error ? error.message : 'ไม่สามารถเพิ่มสินค้าได้'
        });
      }
    }

    return {
      inserted: created.length,
      data: created,
      failed
    };
  }
};
