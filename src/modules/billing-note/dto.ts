import z from 'zod';
import { monthSchema, objectIdSchema } from '../../shared/schema';

export const getBillingNotesDto = z.object({
  date: monthSchema,
  customerId: objectIdSchema.optional()
});

export const getEligibleOrdersDto = z.object({
  startDate: monthSchema,
  endDate: monthSchema,
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
