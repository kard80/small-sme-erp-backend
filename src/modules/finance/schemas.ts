import { z } from 'zod';

export const paymentSchema = z.object({
  customerCreditId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  paymentDate: z.string().min(1).default(() => new Date().toISOString()),
  note: z.string().optional()
});
