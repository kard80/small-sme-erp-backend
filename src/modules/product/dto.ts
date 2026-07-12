import z from 'zod';
import { objectIdSchema } from '../../shared/schema';

export const productOrderHistoryDto = z.object({
  productId: objectIdSchema,
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(10),
  deliveryStartDate: z.string(),
  deliveryEndDate: z.string(),
});
