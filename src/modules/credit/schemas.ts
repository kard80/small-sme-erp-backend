import { z } from 'zod';

export const customerCreditSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  customerId: z.coerce.number().int().positive(),
  totalAmount: z.coerce.number().nonnegative(),
  paidAmount: z.coerce.number().nonnegative().default(0),
  status: z.enum(['pending', 'paid', 'cancelled'])
});

export const customerCreditUpdateSchema = customerCreditSchema.partial();
