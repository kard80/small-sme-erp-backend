import moment from '../../shared/moment';
import { z } from 'zod';

// Parse a YYYY-MM-DD string as midnight in Thai timezone (UTC+7)
const thaiDate = z.string().transform(val => moment.parseZone(val.replace(/T.*$/, '') + 'T00:00:00.000+07:00').toDate());

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
  customerDepartment: z.string().trim().min(1).optional(),
  dueDate: thaiDate,
  deliveryDate: thaiDate,
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
