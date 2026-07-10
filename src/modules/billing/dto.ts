import z from 'zod';
import { objectIdSchema } from '../../shared/schema';

export const getBillingDto = z.object({
  date: z.string().regex(/^\d{4}-\d{2}/, 'Invalid date format, expected YYYY-MM'),
  customerId: objectIdSchema
});

export const createBillingNoteDto = z.object({
  issuedDate: z.coerce.date(),
  customerId: objectIdSchema,
  orderIds: z.array(objectIdSchema).nonempty('Order IDs cannot be empty')
});

export const manualInsertBillingNoteDto = z.object({
  billingNoteId: objectIdSchema
});
