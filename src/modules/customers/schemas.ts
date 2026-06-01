import { z } from 'zod';

export const customerSchema = z.object({
  customerName: z.string().min(1),
  address: z.string().min(1),
  billName: z.string().min(1)
});

export const customerUpdateSchema = customerSchema.partial();
