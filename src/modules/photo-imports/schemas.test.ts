import { describe, expect, it } from 'vitest';
import { claudeLinesSchema, detectImageType, listQuerySchema } from './schemas';

describe('detectImageType', () => {
  it('recognises JPEG, PNG and WebP by magic bytes', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(detectImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });

  it('rejects other content', () => {
    expect(detectImageType(Buffer.from('GIF89a......'))).toBeUndefined();
    expect(detectImageType(Buffer.from('<svg></svg>'))).toBeUndefined();
    expect(detectImageType(Buffer.alloc(0))).toBeUndefined();
  });
});

describe('listQuerySchema / claudeLinesSchema', () => {
  it('validates status filter', () => {
    expect(listQuerySchema.safeParse({ status: 'ready' }).success).toBe(true);
    expect(listQuerySchema.safeParse({ status: 'nope' }).success).toBe(false);
  });

  it('requires well-formed Claude lines', () => {
    const line = { rawText: 'a', qty: 1, unit: 'x', productId: null, confidence: 'low', alternatives: [] };
    expect(claudeLinesSchema.safeParse({ lines: [line] }).success).toBe(true);
    expect(claudeLinesSchema.safeParse({ lines: [{ ...line, confidence: 'sure' }] }).success).toBe(false);
  });
});
