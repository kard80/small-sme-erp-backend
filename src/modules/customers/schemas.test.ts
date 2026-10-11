import { describe, expect, it } from 'vitest';
import { customerSchema, customerUpdateSchema } from './schemas';

describe('customer schemas', () => {
  const customer = { customerName: 'a', address: 'b', billName: 'c' };
  it('requires core fields and caps the DN prefix at 10 chars', () => {
    expect(customerSchema.safeParse(customer).success).toBe(true);
    expect(customerSchema.safeParse({ ...customer, billName: '' }).success).toBe(false);
    expect(customerSchema.safeParse({ ...customer, deliveryNotePrefix: 'x'.repeat(11) }).success).toBe(false);
    expect(customerUpdateSchema.safeParse({}).success).toBe(true);
  });
});

