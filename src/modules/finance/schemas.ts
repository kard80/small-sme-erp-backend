import { z } from 'zod';

export const paymentSchema = z.object({
  customerCreditId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  amount: z.coerce.number().positive(),
  paymentDate: z.coerce.date().default(() => new Date()),
  note: z.string().optional()
});
