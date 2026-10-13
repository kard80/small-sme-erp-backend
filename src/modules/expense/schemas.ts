import { z } from 'zod';

const amountSchema = z
  .number()
  .min(0)
  .max(99999999.99)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'จำนวนเงินต้องไม่เกิน 2 ตำแหน่งทศนิยม');

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((s) => new Date(`${s}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), 'วันที่ไม่ถูกต้อง');

const todayBangkok = () => new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())}T00:00:00.000Z`);

const baseShape = {
  item: z.string().trim().min(1).max(200),
  amount: amountSchema,
  // '' is allowed: clears the field on PATCH, treated as absent on POST.
  note: z.string().max(1000).optional(),
  expenseDate: dateSchema
};

export const expenseSchema = z.object({ ...baseShape, expenseDate: baseShape.expenseDate.optional().transform((d) => d ?? todayBangkok()) });

export const expenseUpdateSchema = z.object(baseShape).partial();

const queryDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
export const expenseSummaryQuerySchema = z.object({ startDate: queryDate, endDate: queryDate });
