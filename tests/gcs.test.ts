import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSignedUrlMock,
  saveMock,
  fileMock,
  bucketMock,
  storageConstructorMock
} = vi.hoisted(() => {
  const getSignedUrlMock = vi.fn();
  const saveMock = vi.fn();
  const fileMock = vi.fn(() => ({
    getSignedUrl: getSignedUrlMock,
    save: saveMock
  }));
  const bucketMock = vi.fn(() => ({
    file: fileMock
  }));
  const storageConstructorMock = vi.fn(function StorageMock(this: { options: unknown }, options: unknown) {
    this.options = options;
  });

  return {
    getSignedUrlMock,
    saveMock,
    fileMock,
    bucketMock,
    storageConstructorMock
  };
});

vi.mock('@google-cloud/storage', () => {
  storageConstructorMock.prototype.bucket = bucketMock;
  return {
    Storage: storageConstructorMock
  };
});

import {
  createGcsClient,
  createSignedImageUploadUrl,
  getGcsRuntimeConfig,
  isGcsConfigured,
  uploadObjectToBucket
} from '../src/shared/gcs';

const originalEnv = {
  GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME,
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
  GCS_KEY_FILENAME: process.env.GCS_KEY_FILENAME,
  GCS_SIGNED_URL_EXPIRES_SECONDS: process.env.GCS_SIGNED_URL_EXPIRES_SECONDS
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-02T03:04:05.000Z'));
  getSignedUrlMock.mockReset();
  saveMock.mockReset();
  fileMock.mockClear();
  bucketMock.mockClear();
  storageConstructorMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
});

describe('gcs runtime setup', () => {
  it('reports whether the bucket configuration is present', () => {
    delete process.env.GCS_BUCKET_NAME;
    expect(isGcsConfigured()).toBe(false);

    process.env.GCS_BUCKET_NAME = ' erp-images ';
    expect(isGcsConfigured()).toBe(true);
  });

  it('returns trimmed runtime config and default expiry', () => {
    process.env.GCS_BUCKET_NAME = ' erp-images ';
    process.env.GCP_PROJECT_ID = ' demo-project ';
    process.env.GCS_KEY_FILENAME = ' /tmp/service-account.json ';

    expect(getGcsRuntimeConfig()).toEqual({
      bucketName: 'erp-images',
      projectId: 'demo-project',
      keyFilename: '/tmp/service-account.json',
      signedUrlExpiresSeconds: 900
    });
  });

  it('builds a storage client from the configured options', () => {
    process.env.GCP_PROJECT_ID = 'demo-project';
    process.env.GCS_KEY_FILENAME = '/tmp/service-account.json';

    const client = createGcsClient() as { options: unknown };

    expect(storageConstructorMock).toHaveBeenCalledWith({
      projectId: 'demo-project',
      keyFilename: '/tmp/service-account.json'
    });
    expect(client.options).toEqual({
      projectId: 'demo-project',
      keyFilename: '/tmp/service-account.json'
    });
  });

  it('throws when the bucket name is missing for signed upload configuration', () => {
    delete process.env.GCS_BUCKET_NAME;

    expect(() => getGcsRuntimeConfig()).toThrow('GCS_BUCKET_NAME is required');
  });

  it('throws when the configured default expiry is invalid', () => {
    process.env.GCS_BUCKET_NAME = 'erp-images';
    process.env.GCS_SIGNED_URL_EXPIRES_SECONDS = '0';

    expect(() => getGcsRuntimeConfig()).toThrow('GCS_SIGNED_URL_EXPIRES_SECONDS must be a positive integer');
  });
});

describe('signed GCS image uploads', () => {
  it('creates a signed PUT upload URL for an image', async () => {
    process.env.GCS_BUCKET_NAME = 'erp-images';
    process.env.GCP_PROJECT_ID = 'demo-project';
    getSignedUrlMock.mockResolvedValue(['https://storage.googleapis.com/upload-url']);

    const result = await createSignedImageUploadUrl({
      contentType: ' image/jpeg ',
      objectPrefix: '/product-images/',
      expiresInSeconds: 300
    });

    expect(storageConstructorMock).toHaveBeenCalledWith({
      projectId: 'demo-project'
    });
    expect(bucketMock).toHaveBeenCalledWith('erp-images');
    expect(fileMock).toHaveBeenCalledWith(
      expect.stringMatching(/^product-images\/2026\/06\/[0-9a-f-]+\.jpg$/)
    );
    expect(getSignedUrlMock).toHaveBeenCalledWith({
      version: 'v4',
      action: 'write',
      expires: new Date('2026-06-02T03:09:05.000Z'),
      contentType: 'image/jpeg'
    });
    expect(result).toEqual({
      objectKey: expect.stringMatching(/^product-images\/2026\/06\/[0-9a-f-]+\.jpg$/),
      uploadUrl: 'https://storage.googleapis.com/upload-url',
      expiresAt: '2026-06-02T03:09:05.000Z',
      method: 'PUT',
      requiredHeaders: {
        'Content-Type': 'image/jpeg'
      }
    });
  });

  it('uses the configured default prefix and expiry when omitted', async () => {
    process.env.GCS_BUCKET_NAME = 'erp-images';
    process.env.GCS_SIGNED_URL_EXPIRES_SECONDS = '120';
    getSignedUrlMock.mockResolvedValue(['https://storage.googleapis.com/upload-url']);

    const result = await createSignedImageUploadUrl({
      contentType: 'image/png'
    });

    expect(fileMock).toHaveBeenCalledWith(expect.stringMatching(/^images\/2026\/06\/[0-9a-f-]+\.png$/));
    expect(result.expiresAt).toBe('2026-06-02T03:06:05.000Z');
    expect(result.requiredHeaders).toEqual({
      'Content-Type': 'image/png'
    });
  });

  it('rejects non-image content types', async () => {
    process.env.GCS_BUCKET_NAME = 'erp-images';

    await expect(
      createSignedImageUploadUrl({
        contentType: 'application/pdf'
      })
    ).rejects.toThrow('contentType must be an image MIME type');
  });

  it('rejects invalid per-request expiry values', async () => {
    process.env.GCS_BUCKET_NAME = 'erp-images';

    await expect(
      createSignedImageUploadUrl({
        contentType: 'image/webp',
        expiresInSeconds: 0
      })
    ).rejects.toThrow('expiresInSeconds must be a positive integer');
  });

  it('uploads a binary object to a chosen bucket', async () => {
    process.env.GCP_PROJECT_ID = 'demo-project';

    const body = Buffer.from('pdf-bytes');
    const result = await uploadObjectToBucket(
      ' correction-department-private ',
      'DN/DN20260601.pdf',
      body,
      ' application/pdf '
    );

    expect(storageConstructorMock).toHaveBeenCalledWith({
      projectId: 'demo-project'
    });
    expect(bucketMock).toHaveBeenCalledWith('correction-department-private');
    expect(fileMock).toHaveBeenCalledWith('DN/DN20260601.pdf');
    expect(saveMock).toHaveBeenCalledWith(body, {
      contentType: 'application/pdf',
      resumable: false
    });
    expect(result).toEqual({
      bucketName: 'correction-department-private',
      objectKey: 'DN/DN20260601.pdf'
    });
  });
});
