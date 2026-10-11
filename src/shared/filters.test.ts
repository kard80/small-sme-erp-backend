import { describe, expect, it } from 'vitest';
import { ComparableFilter } from './filters';

describe('ComparableFilter', () => {
  it('rejects an empty filter', () => {
    expect(() => new ComparableFilter({})).toThrow();
  });

  it('rejects $eq/$ne/$in combined with other operators', () => {
    expect(() => new ComparableFilter({ $eq: 1, $gt: 0 })).toThrow();
    expect(() => new ComparableFilter({ $ne: 1, $gt: 0 })).toThrow();
    expect(() => new ComparableFilter({ $in: [1], $gt: 0 })).toThrow();
  });

  it('rejects both $gt/$gte and $lt/$lte', () => {
    expect(() => new ComparableFilter({ $gt: 1, $gte: 1 })).toThrow();
    expect(() => new ComparableFilter({ $lt: 1, $lte: 1 })).toThrow();
  });

  it('maps to mongo operators', () => {
    expect(new ComparableFilter({ $eq: 'a' }).toMongoOperator()).toBe('a');
    expect(new ComparableFilter({ $in: ['a', 'b'] }).toMongoOperator()).toEqual({ $in: ['a', 'b'] });
    expect(new ComparableFilter({ $gte: 1, $lt: 5 }).toMongoOperator()).toEqual({ $gte: 1, $lt: 5 });
    expect(new ComparableFilter({ $ne: null }).toMongoOperator()).toEqual({ $ne: null });
  });
});

