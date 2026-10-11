import { describe, expect, it } from 'vitest';
import { pickDefined } from './utils';

describe('pickDefined', () => {
  it('drops undefined but keeps null, 0 and empty string', () => {
    expect(pickDefined({ a: undefined, b: null, c: 0, d: '' })).toEqual({ b: null, c: 0, d: '' });
  });
});

