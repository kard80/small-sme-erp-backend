import { z } from 'zod';

export const customerCreditSchema = z.object({
  orderId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  customerId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  totalAmount: z.coerce.number().nonnegative(),
  paidAmount: z.coerce.number().nonnegative().default(0),
  status: z.enum(['pending', 'paid', 'cancelled'])
});

export const customerCreditUpdateSchema = customerCreditSchema.partial();
