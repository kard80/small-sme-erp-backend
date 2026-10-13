import { describe, expect, it } from 'vitest';
import { expenseSchema, expenseUpdateSchema } from './schemas';

const ok = (amount: unknown) => expenseSchema.safeParse({ item: 'x', amount }).success;

describe('expense schemas', () => {
  it('validates amount: unsigned, max 2 decimals, bounds', () => {
    expect([0, 1, 1.5, 10.25, 0.07, 99999999.99].map(ok)).toEqual(Array(6).fill(true));
    expect([-1, 1.234, 100000000, '5'].map(ok)).toEqual(Array(4).fill(false));
  });

  it('defaults expenseDate to today and parses ISO dates', () => {
    expect(expenseSchema.parse({ item: 'x', amount: 1 }).expenseDate).toBeInstanceOf(Date);
    expect(expenseSchema.parse({ item: 'x', amount: 1, expenseDate: '2026-01-02' }).expenseDate.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(expenseSchema.safeParse({ item: 'x', amount: 1, expenseDate: '2026-13-40' }).success).toBe(false);
    expect(expenseSchema.safeParse({ item: 'x', amount: 1, expenseDate: 'yesterday' }).success).toBe(false);
  });

  it('enforces item and note limits', () => {
    expect(expenseSchema.safeParse({ item: '', amount: 1 }).success).toBe(false);
    expect(expenseSchema.safeParse({ item: 'a'.repeat(201), amount: 1 }).success).toBe(false);
    expect(expenseSchema.safeParse({ item: 'x', amount: 1, note: 'n'.repeat(1001) }).success).toBe(false);
  });

  it('update is partial and does not inject a date', () => {
    expect(expenseUpdateSchema.parse({})).toEqual({});
    expect(expenseUpdateSchema.safeParse({ note: '' }).success).toBe(true);
    expect(expenseUpdateSchema.safeParse({ amount: -1 }).success).toBe(false);
  });
});
