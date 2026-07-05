import z from 'zod';
import { objectIdSchema } from '../../shared/schema';

export const getBillingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}/, 'Invalid date format, expected YYYY-MM'),
  customerId: objectIdSchema,
});