import { z } from 'zod';

const productBaseSchema = z.object({
  productName: z.string().min(1),
  unit: z.string().min(1),
  defaultBuyPrice: z.coerce.number().nonnegative().optional(),
  sellPrice: z.coerce.number().nonnegative()
});

export const createProductSchema = productBaseSchema;

export const importProductSchema = productBaseSchema.extend({
  status: z.enum(['active', 'inactive']).default('active')
});

export const productUpdateSchema = importProductSchema.partial();
