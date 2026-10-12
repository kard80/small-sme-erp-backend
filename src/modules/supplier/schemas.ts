import { z } from 'zod';
import { objectIdSchema } from '../../shared/schema';

export const supplierSchema = z.object({
  supplierName: z.string().min(1),
  // '' is allowed: clears the field on PATCH, treated as absent on POST.
  phone: z.string().optional(),
  remark: z.string().optional()
});

export const supplierUpdateSchema = supplierSchema.partial();

const conditionSchema = z.object({ note: z.string().min(1).optional() }).optional();

const noDuplicates = (key: 'productId' | 'supplierId') => (items: Array<Record<string, unknown>>) =>
  new Set(items.map((item) => item[key])).size === items.length;

export const productSuppliersSchema = z
  .array(z.object({ supplierId: objectIdSchema, priority: z.number().int().min(1), condition: conditionSchema }))
  .refine(noDuplicates('supplierId'), 'supplierId ซ้ำ');

export const supplierProductsSchema = z
  .array(z.object({ productId: objectIdSchema, priority: z.number().int().min(1), condition: conditionSchema }))
  .refine(noDuplicates('productId'), 'productId ซ้ำ');
