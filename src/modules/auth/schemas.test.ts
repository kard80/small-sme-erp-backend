import { describe, expect, it } from 'vitest';
import { loginSchema, refreshSchema } from './schemas';

describe('auth schemas', () => {
  it('require non-empty strings', () => {
    expect(loginSchema.safeParse({ username: 'a', password: '' }).success).toBe(false);
    expect(refreshSchema.safeParse({}).success).toBe(false);
  });
});

