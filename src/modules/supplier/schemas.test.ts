import { describe, expect, it } from 'vitest';
import { productSuppliersSchema, supplierSchema, supplierUpdateSchema } from './schemas';

const id = (n: number) => String(n).padStart(24, '0');

describe('supplier schemas', () => {
  it('requires supplierName', () => {
    expect(supplierSchema.safeParse({ phone: '081' }).success).toBe(false);
    expect(supplierSchema.safeParse({ supplierName: 'A' }).success).toBe(true);
  });

  it('accepts links with priority and condition note', () => {
    const r = productSuppliersSchema.safeParse([{ supplierId: id(1), priority: 1, condition: { note: 'x' } }]);
    expect(r.success).toBe(true);
  });

  it('rejects duplicate suppliers and bad priority', () => {
    expect(productSuppliersSchema.safeParse([
      { supplierId: id(1), priority: 1 },
      { supplierId: id(1), priority: 2 }
    ]).success).toBe(false);
    expect(productSuppliersSchema.safeParse([{ supplierId: id(1), priority: 0 }]).success).toBe(false);
  });
});

describe('supplier schemas: clearing', () => {
  it('rejects empty supplierName but accepts empty phone/remark', () => {
    expect(supplierSchema.safeParse({ supplierName: '' }).success).toBe(false);
    expect(supplierSchema.safeParse({ supplierName: 'A', phone: '', remark: '' }).success).toBe(true);
    expect(supplierUpdateSchema.safeParse({ phone: '', remark: '' }).success).toBe(true);
    expect(supplierUpdateSchema.safeParse({ supplierName: '' }).success).toBe(false);
    expect(supplierUpdateSchema.safeParse({}).success).toBe(true);
  });
});
