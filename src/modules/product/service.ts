import type { ZodIssue } from 'zod';
import { BadRequestError } from '../../shared/errors';
import { importProductSchema } from './schemas';
import { productRepository } from './repository';
import { orderItemService } from '../order/services/order-item';
import { Pagination } from '../../shared/pagination';
import moment from 'moment';

type ProductImportRow = Array<string | number | undefined>;

const formatRowReason = (issues: ZodIssue[]) =>
  issues
    .map((issue) => {
      const field = issue.path.length > 0 && typeof issue.path[0] !== 'symbol' ? String(issue.path[0]) : 'row';
      return `${field}: ${issue.message}`;
    })
    .join(', ');

const ensureProductNameAndUnitAvailable = async (productName: string, unit: string, excludedId?: string) => {
  const existingProduct = await productRepository.findByProductNameAndUnit(productName, unit);
  if (existingProduct && existingProduct._id.toString() !== excludedId) {
    throw new BadRequestError('ชื่อสินค้าและหน่วยมีอยู่แล้ว');
  }
};

interface GetProductHistoryParams {
  productId: string;
  page: number;
  pageSize: number;
  deliveryStartDate: string;
  deliveryEndDate: string;
}

export const productService = {
  async createProduct(input: Parameters<typeof productRepository.create>[0]) {
    await ensureProductNameAndUnitAvailable(input.productName, input.unit);
    return productRepository.create(input);
  },

  async getProductOrderHistory(input: GetProductHistoryParams) {
    if (!input.page || !input.pageSize) {
      throw new BadRequestError('page and pageSize are required');
    }

    return orderItemService.findProductHistory({
      productId: input.productId,
      deliveryDateRange: {
        start: moment(input.deliveryStartDate).toDate(),
        end: moment(input.deliveryEndDate).toDate()
      },
      pagination: new Pagination(input.page, input.pageSize)
    });
  },

  listProducts(page?: number, pageSize?: number, countZeroBuyPrice?: boolean) {
    return productRepository.list(page, pageSize, countZeroBuyPrice);
  },

  searchProducts(query: string) {
    return productRepository.search(query);
  },

  async updateProduct(id: string, input: Parameters<typeof productRepository.update>[1]) {
    if (input.productName !== undefined || input.unit !== undefined) {
      const current = await productRepository.findById(id);
      const productName = input.productName ?? current?.productName ?? '';
      const unit = input.unit ?? current?.unit ?? '';
      await ensureProductNameAndUnitAvailable(productName, unit, id);
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

      const productKey = `${parsed.data.productName}_${parsed.data.unit}`;

      if (importedProductNames.has(productKey)) {
        failed.push({
          row,
          productName: parsed.data.productName,
          reason: 'พบชื่อสินค้าและหน่วยซ้ำในไฟล์นำเข้า'
        });
        continue;
      }

      const existingProduct = await productRepository.findByProductNameAndUnit(
        parsed.data.productName,
        parsed.data.unit
      );
      if (existingProduct) {
        failed.push({
          row,
          productName: parsed.data.productName,
          reason: 'ชื่อสินค้าและหน่วยมีอยู่แล้ว'
        });
        continue;
      }

      try {
        created.push(await productRepository.create(parsed.data));
        importedProductNames.add(productKey);
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
