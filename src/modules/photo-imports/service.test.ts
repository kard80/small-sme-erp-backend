import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./repository', () => ({
  photoImportRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findOwned: vi.fn(),
    listByUser: vi.fn(),
    softDelete: vi.fn(),
    countSince: vi.fn(),
    transition: vi.fn(),
    markReady: vi.fn(),
    markFailed: vi.fn(),
    failStale: vi.fn()
  }
}));
vi.mock('./claude', () => ({ readOrderLines: vi.fn() }));
vi.mock('../product/repository', () => ({ productRepository: { listActiveCatalog: vi.fn() },
  unitRepository: { list: vi.fn() }
}));
vi.mock('../../shared/gcs', () => ({
  correctionDepartmentBucketName: 'bucket',
  uploadObjectToBucket: vi.fn(),
  downloadObjectFromBucket: vi.fn(),
  deleteObjectFromBucket: vi.fn(),
  createSignedObjectDownloadUrl: vi.fn()
}));

import { deleteObjectFromBucket, downloadObjectFromBucket, uploadObjectToBucket, createSignedObjectDownloadUrl } from '../../shared/gcs';
import { productRepository, unitRepository } from '../product/repository';
import { readOrderLines } from './claude';
import { photoImportRepository as repo } from './repository';
import { photoImportsService, processImport } from './service';

const pId = new Types.ObjectId();
const altId = new Types.ObjectId();
const alt2Id = new Types.ObjectId();
const alt3Id = new Types.ObjectId();
const docId = new Types.ObjectId().toString();
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

const catalog = [
  { _id: pId, productName: 'Rice', unit: 'bag', sellPrice: 1 },
  { _id: altId, productName: 'Rice B', unit: 'bag', sellPrice: 1 },
  { _id: alt2Id, productName: 'Rice C', unit: 'bag', sellPrice: 1 },
  { _id: alt3Id, productName: 'Rice D', unit: 'bag', sellPrice: 1 }
];
const rawLine = (over: object = {}) => ({
  rawText: '2 bag rice',
  qty: 2,
  unit: 'bag',
  productId: String(pId),
  confidence: 'high' as const,
  alternatives: [] as { productId: string }[],
  ...over
});

const runProcess = async (lines: object[]) => {
  vi.mocked(repo.findById).mockResolvedValue({ _id: docId, status: 'processing', imageKey: 'k.jpg' } as any);
  vi.mocked(downloadObjectFromBucket).mockResolvedValue(jpeg);
  vi.mocked(productRepository.listActiveCatalog).mockResolvedValue(catalog as any);
  vi.mocked(unitRepository.list).mockResolvedValue([{ unitName: 'bag' }, { unitName: 'กิโลกรัม' }] as any);
  vi.mocked(readOrderLines).mockResolvedValue({ lines } as any);
  await processImport(docId);
};

beforeEach(() => vi.resetAllMocks());

describe('processImport', () => {
  it('stores matched lines as ready', async () => {
    await runProcess([rawLine({ alternatives: [{ productId: String(altId) }] })]);
    const lines = vi.mocked(repo.markReady).mock.calls[0][1];
    expect(lines[0]).toMatchObject({ productId: pId, confidence: 'high', unitMismatch: false });
    expect(lines[0].alternatives).toEqual([{ productId: altId, productName: 'Rice B' }]);
  });

  it('keeps a null match as null', async () => {
    await runProcess([rawLine({ productId: null, confidence: 'low' })]);
    expect(vi.mocked(repo.markReady).mock.calls[0][1][0]).toMatchObject({ productId: null, unitMismatch: false });
  });

  it('nulls productIds that are not in the catalog and drops bad alternatives', async () => {
    const ghost = new Types.ObjectId().toString();
    await runProcess([rawLine({ productId: ghost, alternatives: [{ productId: ghost }, { productId: String(altId) }] })]);
    const line = vi.mocked(repo.markReady).mock.calls[0][1][0];
    expect(line.productId).toBeNull();
    expect(line.confidence).toBe('low');
    expect(line.alternatives.map((a) => a.productId)).toEqual([altId]);
  });

  it('recomputes unitMismatch from the catalog and clamps alternatives to 2', async () => {
    await runProcess([
      rawLine({
        unit: 'kg',
        alternatives: [altId, alt2Id, alt3Id, pId].map((i) => ({ productId: String(i) }))
      }),
      rawLine({ unit: ' BAG ' }),
      rawLine({ unit: 'B.A G.' })
    ]);
    const [a, b, c] = vi.mocked(repo.markReady).mock.calls[0][1];
    expect(a.unitMismatch).toBe(true);
    expect(a.alternatives).toHaveLength(2);
    expect(b.unitMismatch).toBe(false);
    expect(c.unitMismatch).toBe(false);
  });

  it('marks failed when Claude fails', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ _id: docId, status: 'processing', imageKey: 'k.jpg' } as any);
    vi.mocked(downloadObjectFromBucket).mockResolvedValue(jpeg);
    vi.mocked(productRepository.listActiveCatalog).mockResolvedValue(catalog as any);
    vi.mocked(unitRepository.list).mockResolvedValue([{ unitName: 'bag' }, { unitName: 'กิโลกรัม' }] as any);
    vi.mocked(readOrderLines).mockRejectedValue(new Error('boom'));
    vi.mocked(repo.markFailed).mockResolvedValue(undefined);
    await processImport(docId);
    expect(repo.markFailed).toHaveBeenCalledWith(docId, 'processing failed');
    expect(repo.markReady).not.toHaveBeenCalled();
  });

  it('fails with a clear message when no lines come back or all are blank', async () => {
    vi.mocked(repo.markFailed).mockResolvedValue(undefined);
    await runProcess([]);
    expect(repo.markFailed).toHaveBeenCalledWith(docId, 'no order lines found in image');
    await runProcess([rawLine({ rawText: '' })]);
    expect(repo.markReady).not.toHaveBeenCalled();
  });

  it('stores qty <= 0 or non-finite as 0 with low confidence', async () => {
    await runProcess([rawLine({ qty: -3 }), rawLine({ qty: 0 }), rawLine({ qty: NaN }), rawLine({ qty: Infinity })]);
    for (const l of vi.mocked(repo.markReady).mock.calls[0][1]) {
      expect(l).toMatchObject({ qty: 0, confidence: 'low' });
    }
  });

  it('fails when Claude makes no tool call, storing only a generic message', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ _id: docId, status: 'processing', imageKey: 'k.jpg' } as any);
    vi.mocked(downloadObjectFromBucket).mockResolvedValue(jpeg);
    vi.mocked(productRepository.listActiveCatalog).mockResolvedValue(catalog as any);
    vi.mocked(unitRepository.list).mockResolvedValue([{ unitName: 'bag' }, { unitName: 'กิโลกรัม' }] as any);
    vi.mocked(readOrderLines).mockRejectedValue(new Error('Claude returned no tool call (stop_reason: end_turn)'));
    vi.mocked(repo.markFailed).mockResolvedValue(undefined);
    await processImport(docId);
    expect(repo.markFailed).toHaveBeenCalledWith(docId, 'processing failed');
  });

  it('uses the supplied buffer instead of downloading', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ _id: docId, status: 'processing', imageKey: 'k.jpg' } as any);
    vi.mocked(productRepository.listActiveCatalog).mockResolvedValue(catalog as any);
    vi.mocked(unitRepository.list).mockResolvedValue([{ unitName: 'bag' }, { unitName: 'กิโลกรัม' }] as any);
    vi.mocked(readOrderLines).mockResolvedValue({ lines: [rawLine()] } as any);
    await processImport(docId, jpeg);
    expect(downloadObjectFromBucket).not.toHaveBeenCalled();
    expect(repo.markReady).toHaveBeenCalled();
  });

  it('skips imports that are no longer processing', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ _id: docId, status: 'consumed' } as any);
    await processImport(docId);
    expect(readOrderLines).not.toHaveBeenCalled();
  });
});

describe('upload', () => {
  beforeEach(() => {
    vi.mocked(repo.countSince).mockResolvedValue(0);
    vi.mocked(repo.create).mockResolvedValue({ _id: docId, status: 'processing' } as any);
    vi.mocked(repo.findById).mockResolvedValue(null);
  });

  it('stores the image, processes inline and returns the final status', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ status: 'ready' } as any);
    const result = await photoImportsService.upload('u1', { buffer: jpeg, mimetype: 'image/jpeg' });
    expect(result).toEqual({ id: docId, status: 'ready' });
    expect(vi.mocked(uploadObjectToBucket).mock.calls[0][1]).toMatch(/^photo-imports\/.+\.jpg$/);
  });

  it('rejects missing files, mimetype/magic mismatch and rate-limit overflow', async () => {
    await expect(photoImportsService.upload('u1', undefined)).rejects.toMatchObject({ statusCode: 400 });
    await expect(photoImportsService.upload('u1', { buffer: jpeg, mimetype: 'image/png' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(photoImportsService.upload('u1', { buffer: Buffer.from('nope'), mimetype: 'image/jpeg' })).rejects.toMatchObject({ statusCode: 400 });
    vi.mocked(repo.countSince).mockResolvedValue(30);
    await expect(photoImportsService.upload('u1', { buffer: jpeg, mimetype: 'image/jpeg' })).rejects.toMatchObject({ statusCode: 429 });
    expect(uploadObjectToBucket).not.toHaveBeenCalled();
  });
});

describe('state rules and ownership', () => {
  it('retry only from failed; 404 for another user, 409 for wrong state', async () => {
    vi.mocked(repo.countSince).mockResolvedValue(0);
    vi.mocked(repo.transition).mockResolvedValueOnce({ _id: docId } as any);
    vi.mocked(repo.findById).mockResolvedValue({ status: 'ready' } as any);
    expect(await photoImportsService.retry('u1', docId)).toEqual({ id: docId, status: 'ready' });
    expect(repo.transition).toHaveBeenCalledWith(docId, 'u1', 'failed', 'processing', expect.any(Date));

    vi.mocked(repo.transition).mockResolvedValue(null);
    vi.mocked(repo.findOwned).mockResolvedValueOnce(null);
    await expect(photoImportsService.retry('u2', docId)).rejects.toMatchObject({ statusCode: 404 });
    vi.mocked(repo.findOwned).mockResolvedValueOnce({ _id: docId, status: 'ready' } as any);
    await expect(photoImportsService.retry('u1', docId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('retry is rate limited and counts as an attempt', async () => {
    vi.mocked(repo.countSince).mockResolvedValue(30);
    await expect(photoImportsService.retry('u1', docId)).rejects.toMatchObject({ statusCode: 429 });
    expect(repo.transition).not.toHaveBeenCalled();
  });

  it('retry passes a stale cutoff so fresh processing stays 409', async () => {
    vi.mocked(repo.countSince).mockResolvedValue(0);
    vi.mocked(repo.transition).mockResolvedValue(null);
    vi.mocked(repo.findOwned).mockResolvedValue({ _id: docId, status: 'processing' } as any);
    await expect(photoImportsService.retry('u1', docId)).rejects.toMatchObject({ statusCode: 409 });
    const cutoff = vi.mocked(repo.transition).mock.calls[0][4] as Date;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThan(5 * 60 * 1000);

    vi.mocked(repo.transition).mockResolvedValueOnce({ _id: docId } as any);
    vi.mocked(repo.findById).mockResolvedValue({ status: 'ready' } as any);
    expect(await photoImportsService.retry('u1', docId)).toEqual({ id: docId, status: 'ready' });
  });

  it('second consume is 409', async () => {
    vi.mocked(repo.transition).mockResolvedValue(null);
    vi.mocked(repo.findOwned).mockResolvedValue({ _id: docId, status: 'consumed' } as any);
    await expect(photoImportsService.consume('u1', docId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('consume only from ready', async () => {
    vi.mocked(repo.transition).mockResolvedValueOnce({ _id: docId } as any);
    expect(await photoImportsService.consume('u1', docId)).toEqual({ id: docId, status: 'consumed' });
    expect(repo.transition).toHaveBeenCalledWith(docId, 'u1', 'ready', 'consumed', undefined);

    vi.mocked(repo.transition).mockResolvedValue(null);
    vi.mocked(repo.findOwned).mockResolvedValue({ _id: docId, status: 'failed' } as any);
    await expect(photoImportsService.consume('u1', docId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('get is scoped to the owner and includes a signed image url', async () => {
    vi.mocked(repo.findOwned).mockResolvedValueOnce(null);
    await expect(photoImportsService.get('u2', docId)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.findOwned).toHaveBeenCalledWith(docId, 'u2');

    vi.mocked(repo.findOwned).mockResolvedValueOnce({
      _id: docId, status: 'ready', imageKey: 'k', lines: [], createdAt: new Date(0)
    } as any);
    vi.mocked(createSignedObjectDownloadUrl).mockResolvedValue({ downloadUrl: 'https://signed' } as any);
    expect(await photoImportsService.get('u1', docId)).toMatchObject({ id: docId, imageUrl: 'https://signed', error: null });
  });

  it('list maps lineCount', async () => {
    vi.mocked(repo.listByUser).mockResolvedValue([{ _id: docId, status: 'ready', createdAt: new Date(0), lines: [{}, {}] }] as any);
    expect(await photoImportsService.list('u1', 'ready')).toEqual([
      { id: docId, status: 'ready', createdAt: new Date(0), lineCount: 2 }
    ]);
  });
});

describe('remove', () => {
  it('soft-deletes the owner import and deletes its image; 404 when not found', async () => {
    vi.mocked(deleteObjectFromBucket).mockResolvedValue(undefined);
    vi.mocked(repo.softDelete).mockResolvedValueOnce({ _id: docId, imageKey: 'photo-imports/a.jpg' } as any);
    await photoImportsService.remove('u1', docId);
    expect(repo.softDelete).toHaveBeenCalledWith(docId, 'u1');
    expect(deleteObjectFromBucket).toHaveBeenCalledWith('bucket', 'photo-imports/a.jpg');

    vi.mocked(repo.softDelete).mockResolvedValueOnce(null);
    await expect(photoImportsService.remove('u2', docId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('still succeeds when the image delete fails', async () => {
    vi.mocked(repo.softDelete).mockResolvedValueOnce({ _id: docId, imageKey: 'k' } as any);
    vi.mocked(deleteObjectFromBucket).mockRejectedValueOnce(new Error('gcs down'));
    await expect(photoImportsService.remove('u1', docId)).resolves.toBeUndefined();
  });
});
