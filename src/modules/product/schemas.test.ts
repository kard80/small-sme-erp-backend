import { describe, expect, it } from 'vitest';
import { createProductSchema, importProductSchema, productUpdateSchema } from './schemas';
import { productOrderHistoryDto } from './dto';

const oid = 'a'.repeat(24);

describe('product schemas', () => {
  it('coerces numeric strings and rejects negatives', () => {
    expect(createProductSchema.parse({ productName: 'a', unit: 'kg', sellPrice: '12.5' }).sellPrice).toBe(12.5);
    expect(createProductSchema.safeParse({ productName: 'a', unit: 'kg', sellPrice: -1 }).success).toBe(false);
    expect(createProductSchema.safeParse({ productName: '', unit: 'kg', sellPrice: 1 }).success).toBe(false);
  });

  it('defaults import status to active and validates the enum', () => {
    expect(importProductSchema.parse({ productName: 'a', unit: 'kg', sellPrice: 1 }).status).toBe('active');
    expect(importProductSchema.safeParse({ productName: 'a', unit: 'kg', sellPrice: 1, status: 'x' }).success).toBe(false);
  });

  it('productUpdateSchema does not re-apply the active default', () => {
    expect(productUpdateSchema.parse({ sellPrice: 1 })).toEqual({ sellPrice: 1 });
  });

  it('product history dto defaults paging and requires dates', () => {
    const ok = productOrderHistoryDto.parse({ productId: oid, deliveryStartDate: 'a', deliveryEndDate: 'b' });
    expect(ok).toMatchObject({ page: 1, pageSize: 10 });
    expect(productOrderHistoryDto.safeParse({ productId: oid }).success).toBe(false);
    expect(productOrderHistoryDto.safeParse({ productId: 'x', deliveryStartDate: 'a', deliveryEndDate: 'b' }).success).toBe(false);
  });
});

