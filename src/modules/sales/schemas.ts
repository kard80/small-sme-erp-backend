import { z } from 'zod';

export const orderInputSchema = z.object({
  productId: z.coerce.number().int().positive(),
  productName: z.string().min(1),
  unit: z.string().min(1),
  buyPrice: z.coerce.number().nonnegative(),
  sellPrice: z.coerce.number().nonnegative(),
  customerId: z.coerce.number().int().positive(),
  dueDate: z.string().min(1),
  status: z.enum(['pending', 'completed', 'cancelled'])
});

export const orderUpdateSchema = orderInputSchema.partial();
