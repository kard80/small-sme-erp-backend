import moment from '../../shared/moment';
import { z } from 'zod';

// Parse a YYYY-MM-DD string as midnight in Thai timezone (UTC+7)
const thaiDate = z.string().transform(val => moment.parseZone(val.replace(/T.*$/, '') + 'T00:00:00.000+07:00').toDate());

const orderItemInputSchema = z.object({
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  productName: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.coerce.number().positive(),
  buyPrice: z.coerce.number().nonnegative(),
  sellPrice: z.coerce.number().nonnegative()
});

// Becomes the bucket key (DN/{number}.pdf), so no path separators or .pdf suffix.
export const customDeliveryNoteSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[^/\\"';%?#\x00-\x1f]+$/, 'เลขที่ใบส่งของมีอักขระที่ไม่อนุญาต')
  .refine((v) => !/\.pdf$/i.test(v), 'เลขที่ใบส่งของต้องไม่ลงท้ายด้วย .pdf');

export const createDeliveryNoteSchema = z.object({ deliveryNote: customDeliveryNoteSchema.optional() });

export const orderInputSchema = z.object({
  customerId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  customerDepartment: z.string().trim().min(1).optional(),
  materialCategory: z.string().trim().min(1).optional(),
  remark: z.string().trim().optional(),
  dueDate: thaiDate,
  deliveryDate: thaiDate,
  status: z.enum(['draft', 'completed']),
  deliveryNote: customDeliveryNoteSchema.optional(),
  items: z.array(orderItemInputSchema).min(1)
});

export const orderUpdateSchema = orderInputSchema.partial();

export const combinedPurchaseListSchema = z.object({
  orderIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).nonempty('Order IDs cannot be empty'),
  // supplier ObjectIds or 'none' (products without a supplier); omitted = all
  supplierIds: z.array(z.string().regex(/^([0-9a-fA-F]{24}|none)$/)).optional()
});

// Stateless receipt: every field is typed by the user (optionally prefilled by the client from a DN).
export const customReceiptSchema = z.object({
  documentNumber: z.string().trim().min(1).max(50),
  issuedDate: thaiDate.refine((d) => !Number.isNaN(d.getTime()), 'วันที่ไม่ถูกต้อง'),
  customerName: z.string().trim().min(1).max(200),
  customerAddress: z.string().trim().max(500).default(''),
  items: z
    .array(
      z.object({
        productName: z.string().trim().min(1).max(200),
        unit: z.string().trim().max(30).default(''),
        quantity: z.coerce.number().positive(),
        sellPrice: z.coerce.number().nonnegative()
      })
    )
    .min(1)
    .max(200)
});
