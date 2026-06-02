import { z } from 'zod';

export const productSchema = z.object({
  productName: z.string().min(1),
  unit: z.string().min(1),
  defaultBuyPrice: z.coerce.number().nonnegative().optional(),
  sellPrice: z.coerce.number().nonnegative(),
  status: z.enum(['active', 'inactive']).default('active')
});

export const productUpdateSchema = productSchema.partial();
