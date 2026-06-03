import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { orderRepository } from '../src/modules/order/repository';
import { orderOcrUploadBatchInputSchema } from '../src/modules/order/schemas';
import { orderService } from '../src/modules/order/service';
import { createSignedImageUploadUrl } from '../src/shared/gcs';

vi.mock('../src/shared/gcs', () => ({
  createSignedImageUploadUrl: vi.fn()
}));

describe('order OCR upload batch service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(createSignedImageUploadUrl).mockReset();
  });

  it('creates a persisted OCR upload batch and signed upload URLs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-02T03:04:05.678Z'));
    vi.mocked(createSignedImageUploadUrl)
      .mockResolvedValueOnce({
        objectKey: 'orders/ocr/2026-06-02T03-04-05-678Z/a.jpg',
        uploadUrl: 'https://example.com/upload-1',
        expiresAt: '2026-06-02T03:19:05.678Z',
        method: 'PUT',
        requiredHeaders: {
          'Content-Type': 'image/jpeg'
        }
      })
      .mockResolvedValueOnce({
        objectKey: 'orders/ocr/2026-06-02T03-04-05-678Z/b.png',
        uploadUrl: 'https://example.com/upload-2',
        expiresAt: '2026-06-02T03:19:05.678Z',
        method: 'PUT',
        requiredHeaders: {
          'Content-Type': 'image/png'
        }
      });
    vi.spyOn(orderRepository, 'createOcrUploadBatch').mockResolvedValue({
      _id: new Types.ObjectId(),
      folderName: '2026-06-02T03-04-05-678Z',
      filenames: ['invoice-1.jpg', 'invoice-2.png'],
      objectKeys: [
        'orders/ocr/2026-06-02T03-04-05-678Z/a.jpg',
        'orders/ocr/2026-06-02T03-04-05-678Z/b.png'
      ],
      createdAt: new Date('2026-06-02T03:04:05.678Z')
    });

    const result = await orderService.createOcrUploadBatch(['invoice-1.jpg', 'invoice-2.png']);

    expect(createSignedImageUploadUrl).toHaveBeenNthCalledWith(1, {
      contentType: 'image/jpeg',
      objectPrefix: 'orders/ocr/2026-06-02T03-04-05-678Z'
    });
    expect(createSignedImageUploadUrl).toHaveBeenNthCalledWith(2, {
      contentType: 'image/png',
      objectPrefix: 'orders/ocr/2026-06-02T03-04-05-678Z'
    });
    expect(orderRepository.createOcrUploadBatch).toHaveBeenCalledWith({
      folderName: '2026-06-02T03-04-05-678Z',
      filenames: ['invoice-1.jpg', 'invoice-2.png'],
      objectKeys: [
        'orders/ocr/2026-06-02T03-04-05-678Z/a.jpg',
        'orders/ocr/2026-06-02T03-04-05-678Z/b.png'
      ],
      createdAt: new Date('2026-06-02T03:04:05.678Z')
    });
    expect(result).toEqual({
      requestId: expect.any(String),
      folderName: '2026-06-02T03-04-05-678Z',
      createdAt: new Date('2026-06-02T03:04:05.678Z'),
      uploads: [
        {
          filename: 'invoice-1.jpg',
          objectKey: 'orders/ocr/2026-06-02T03-04-05-678Z/a.jpg',
          uploadUrl: 'https://example.com/upload-1',
          expiresAt: '2026-06-02T03:19:05.678Z',
          method: 'PUT',
          requiredHeaders: {
            'Content-Type': 'image/jpeg'
          }
        },
        {
          filename: 'invoice-2.png',
          objectKey: 'orders/ocr/2026-06-02T03-04-05-678Z/b.png',
          uploadUrl: 'https://example.com/upload-2',
          expiresAt: '2026-06-02T03:19:05.678Z',
          method: 'PUT',
          requiredHeaders: {
            'Content-Type': 'image/png'
          }
        }
      ]
    });

    vi.useRealTimers();
  });

  it('rejects unsupported image filename extensions', async () => {
    await expect(orderService.createOcrUploadBatch(['invoice.pdf'])).rejects.toThrow(
      'Unsupported image filename: invoice.pdf'
    );
  });
  it('validates the request shape for the OCR upload batch route', () => {
    const parsed = orderOcrUploadBatchInputSchema.safeParse({
      filenames: []
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.flatten().fieldErrors.filenames).toBeDefined();
  });
});
