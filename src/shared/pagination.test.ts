import { describe, expect, it } from 'vitest';
import { Pagination } from './pagination';

describe('Pagination', () => {
  it('is unpaginated when no args are given', () => {
    const p = new Pagination();
    expect(p.skip).toBeUndefined();
    expect(p.pageSize).toBeUndefined();
  });

  it('computes skip', () => {
    expect(new Pagination(3, 10).skip).toBe(20);
    expect(new Pagination(1, 10).skip).toBe(0);
  });

  it('rejects partial or non-positive values', () => {
    expect(() => new Pagination(1)).toThrow();
    expect(() => new Pagination(undefined, 10)).toThrow();
    expect(() => new Pagination(0, 10)).toThrow();
    expect(() => new Pagination(1, 0)).toThrow();
  });
});

