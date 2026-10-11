import { z } from 'zod';

const productBaseSchema = z.object({
  productName: z.string().min(1),
  unit: z.string().min(1),
  defaultBuyPrice: z.coerce.number().nonnegative().optional(),
  sellPrice: z.coerce.number().nonnegative(),
  remark: z.string().trim().optional()
});

export const createProductSchema = productBaseSchema;

const productStatusSchema = z.enum(['active', 'inactive']);

export const importProductSchema = productBaseSchema.extend({
  status: productStatusSchema.default('active')
});

// Built from the un-defaulted status: .partial() on importProductSchema would still apply the
// 'active' default and reactivate a soft-deleted product on any partial update.
export const productUpdateSchema = productBaseSchema.extend({ status: productStatusSchema }).partial();
