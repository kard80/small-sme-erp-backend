import { z } from 'zod';

const orderItemInputSchema = z.object({
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  productName: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.coerce.number().positive(),
  buyPrice: z.coerce.number().nonnegative(),
  sellPrice: z.coerce.number().nonnegative()
});

export const orderInputSchema = z.object({
  customerId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  dueDate: z.coerce.date(),
  deliveryDate: z.coerce.date(),
  status: z.enum(['draft', 'completed']),
  items: z.array(orderItemInputSchema).min(1)
});

export const orderUpdateSchema = orderInputSchema.partial();

export const orderImageOcrInputSchema = z.object({
  imageUrls: z.array(z.url()).min(1).max(10)
});

export const orderOcrUploadBatchInputSchema = z.object({
  filenames: z.array(z.string().trim().min(1)).min(1).max(10)
});
