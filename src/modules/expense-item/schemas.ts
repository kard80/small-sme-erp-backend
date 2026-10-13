import { z } from 'zod';

export const expenseItemSchema = z.object({ itemName: z.string().trim().min(1).max(200) });
