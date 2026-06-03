import { z } from 'zod';

export const customerCreditSchema = z.object({
  orderId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  customerId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  deliveryNote: z.string().trim().min(1).optional(),
  customerBillName: z.string().trim().min(1),
  dueDate: z.coerce.date(),
  totalAmount: z.coerce.number().nonnegative(),
  paidAmount: z.coerce.number().nonnegative().default(0),
  status: z.enum(['pending', 'partial', 'paid', 'cancelled'])
});

export const customerCreditUpdateSchema = customerCreditSchema.partial();
