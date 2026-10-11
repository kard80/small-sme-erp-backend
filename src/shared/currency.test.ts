import { describe, expect, it } from 'vitest';
import { Currency } from './currency';

describe('Currency', () => {
  it('avoids floating point drift when adding', () => {
    expect(new Currency(0.1).add(new Currency(0.2)).toNumber()).toBe(0.3);
  });

  it('rounds multiplication to 2 decimals', () => {
    expect(new Currency(10.05).multiply(3).toNumber()).toBe(30.15);
    expect(new Currency(1.005).multiply(1).toNumber()).toBe(1);
  });
});

