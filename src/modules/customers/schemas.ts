import { z } from 'zod';

export const customerSchema = z.object({
  customerName: z.string().min(1),
  address: z.string().min(1),
  billName: z.string().min(1),
  deliveryNotePrefix: z.string().min(1).max(10).optional()
});

export const customerUpdateSchema = customerSchema.partial();
