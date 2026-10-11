import { describe, expect, it } from 'vitest';
import { orderInputSchema, orderUpdateSchema } from './schemas';

const oid = 'a'.repeat(24);
const item = { productId: oid, productName: 'a', unit: 'kg', quantity: 1, buyPrice: 0, sellPrice: 1 };
const order = {
  customerId: oid,
  dueDate: '2026-02-01',
  deliveryDate: '2026-01-31',
  status: 'draft',
  items: [item]
};

describe('orderInputSchema', () => {
  it('parses dates as Thai-midnight (UTC+7)', () => {
    const parsed = orderInputSchema.parse(order);
    expect(parsed.deliveryDate.toISOString()).toBe('2026-01-30T17:00:00.000Z');
  });

  it('ignores a time suffix on the date', () => {
    const parsed = orderInputSchema.parse({ ...order, deliveryDate: '2026-01-31T23:59:00Z' });
    expect(parsed.deliveryDate.toISOString()).toBe('2026-01-30T17:00:00.000Z');
  });

  it('rejects empty items, bad customer id, bad status and non-positive quantity', () => {
    expect(orderInputSchema.safeParse({ ...order, items: [] }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...order, customerId: '123' }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...order, status: 'cancelled' }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...order, items: [{ ...item, quantity: 0 }] }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...order, items: [{ ...item, sellPrice: -1 }] }).success).toBe(false);
  });

  it('allows partial updates', () => {
    expect(orderUpdateSchema.safeParse({}).success).toBe(true);
    expect(orderUpdateSchema.safeParse({ status: 'completed' }).success).toBe(true);
    expect(orderUpdateSchema.safeParse({ status: 'nope' }).success).toBe(false);
  });
});

