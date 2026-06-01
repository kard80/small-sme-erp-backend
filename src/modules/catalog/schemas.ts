import { z } from 'zod';

export const productSchema = z.object({
  productName: z.string().min(1),
  unit: z.string().min(1),
  defaultBuyPrice: z.coerce.number().nonnegative(),
  defaultSellPrice: z.coerce.number().nonnegative()
});

export const productUpdateSchema = productSchema.partial();
