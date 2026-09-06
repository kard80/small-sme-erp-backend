import z from 'zod';
import { monthSchema, objectIdSchema } from '../../shared/schema';

export const getReceiptNotesDto = z.object({
  date: monthSchema,
  customerId: objectIdSchema.optional()
});

export const getEligibleBillingNotesDto = z.object({
  startDate: monthSchema,
  endDate: monthSchema,
  customerId: objectIdSchema
});

export const createReceiptNoteDto = z.object({
  receiptDate: z.coerce.date(),
  customerId: objectIdSchema,
  billingNoteIds: z.array(objectIdSchema).nonempty('Billing note IDs cannot be empty')
});

export const receiptNoteIdDto = z.object({
  receiptNoteId: objectIdSchema
});
