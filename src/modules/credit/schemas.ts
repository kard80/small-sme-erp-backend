import moment from 'moment';
import { z } from 'zod';

// Parse a YYYY-MM-DD string as midnight in Thai timezone (UTC+7)
const thaiDate = z.string().transform(val => moment.parseZone(val.replace(/T.*$/, '') + 'T00:00:00.000+07:00').toDate());

export const customerCreditSchema = z.object({
  orderId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  customerId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  deliveryNote: z.string().trim().min(1).optional(),
  customerBillName: z.string().trim().min(1),
  dueDate: thaiDate,
  totalAmount: z.coerce.number().nonnegative(),
  paidAmount: z.coerce.number().nonnegative().default(0),
  status: z.enum(['pending', 'partial', 'paid', 'cancelled'])
});

export const customerCreditUpdateSchema = customerCreditSchema.partial();
