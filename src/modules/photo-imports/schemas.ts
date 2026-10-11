import { z } from 'zod';

export const maxImageBytes = 10 * 1024 * 1024;

export const listQuerySchema = z.object({
  status: z.enum(['processing', 'ready', 'failed', 'consumed']).optional()
});

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export const imageExtension: Record<ImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

// Magic-byte sniffing: the client-declared mimetype alone is not trusted.
export const detectImageType = (buf: Buffer): ImageType | undefined => {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return undefined;
};

// Shape of the tool input Claude returns; validated again server-side against the catalog.
export const claudeLinesSchema = z.object({
  lines: z.array(
    z.object({
      rawText: z.string().transform((s) => s.trim().slice(0, 300)),
      qty: z.number(),
      unit: z.string().transform((s) => s.trim().slice(0, 50)),
      productId: z.string().nullable(),
      confidence: z.enum(['high', 'medium', 'low']),
      alternatives: z.array(z.object({ productId: z.string() }))
    })
  )
});

export type ClaudeLines = z.infer<typeof claudeLinesSchema>;
