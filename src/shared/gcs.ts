import { randomUUID } from 'node:crypto';
import { Storage, type StorageOptions } from '@google-cloud/storage';
import { BadRequestError, InternalServerError } from './errors';

export type GcsRuntimeConfig = {
  bucketName: string;
  projectId?: string;
  keyFilename?: string;
  signedUrlExpiresSeconds: number;
};

export type CreateSignedImageUploadUrlInput = {
  contentType: string;
  expiresInSeconds?: number;
  objectPrefix?: string;
};

export type SignedImageUploadUrl = {
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  method: 'PUT';
  requiredHeaders: Record<string, string>;
};

const defaultSignedUrlExpiresSeconds = 15 * 60;

const imageExtensionByMimeType: Record<string, string> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp'
};

const readOptionalEnv = (name: string) => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const parsePositiveInteger = (value: string, envName: string) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InternalServerError(`${envName} must be a positive integer`);
  }

  return parsed;
};

const getDefaultSignedUrlExpiresSeconds = () => {
  const configuredValue = readOptionalEnv('GCS_SIGNED_URL_EXPIRES_SECONDS');
  return configuredValue
    ? parsePositiveInteger(configuredValue, 'GCS_SIGNED_URL_EXPIRES_SECONDS')
    : defaultSignedUrlExpiresSeconds;
};

const getMimeTypeExtension = (contentType: string) => {
  return imageExtensionByMimeType[contentType.toLowerCase()];
};

const getContentType = (contentType: string) => {
  const normalizedValue = contentType.trim().toLowerCase();
  if (!normalizedValue.startsWith('image/')) {
    throw new BadRequestError('contentType must be an image MIME type');
  }

  return normalizedValue;
};

const getObjectPrefix = (prefix?: string) => {
  const normalizedValue = prefix?.trim().replace(/^\/+|\/+$/g, '');
  return normalizedValue ? normalizedValue : 'images';
};

const createObjectKey = (contentType: string, prefix?: string) => {
  const timestamp = new Date();
  const year = timestamp.getUTCFullYear();
  const month = String(timestamp.getUTCMonth() + 1).padStart(2, '0');
  const extension = getMimeTypeExtension(contentType);
  const suffix = extension ? `.${extension}` : '';

  return `${getObjectPrefix(prefix)}/${year}/${month}/${randomUUID()}${suffix}`;
};

const getSignedUrlExpiresSeconds = (expiresInSeconds?: number) => {
  if (expiresInSeconds === undefined) {
    return getDefaultSignedUrlExpiresSeconds();
  }

  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new BadRequestError('expiresInSeconds must be a positive integer');
  }

  return expiresInSeconds;
};

export const isGcsConfigured = () => Boolean(readOptionalEnv('GCS_BUCKET_NAME'));

export const getGcsRuntimeConfig = (): GcsRuntimeConfig => {
  const bucketName = readOptionalEnv('GCS_BUCKET_NAME');
  if (!bucketName) {
    throw new InternalServerError('GCS_BUCKET_NAME is required');
  }

  return {
    bucketName,
    projectId: readOptionalEnv('GCS_PROJECT_ID'),
    keyFilename: readOptionalEnv('GCS_KEY_FILENAME'),
    signedUrlExpiresSeconds: getDefaultSignedUrlExpiresSeconds()
  };
};

export const createGcsClient = () => {
  const config = getGcsRuntimeConfig();
  const storageOptions: StorageOptions = {};

  if (config.projectId) {
    storageOptions.projectId = config.projectId;
  }
  if (config.keyFilename) {
    storageOptions.keyFilename = config.keyFilename;
  }

  return new Storage(storageOptions);
};

export const createSignedImageUploadUrl = async (
  input: CreateSignedImageUploadUrlInput
): Promise<SignedImageUploadUrl> => {
  const config = getGcsRuntimeConfig();
  const contentType = getContentType(input.contentType);
  const expiresInSeconds = getSignedUrlExpiresSeconds(input.expiresInSeconds);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const objectKey = createObjectKey(contentType, input.objectPrefix);
  const storage = createGcsClient();
  const [uploadUrl] = await storage.bucket(config.bucketName).file(objectKey).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: expiresAt,
    contentType
  });

  return {
    objectKey,
    uploadUrl,
    expiresAt: expiresAt.toISOString(),
    method: 'PUT',
    requiredHeaders: {
      'Content-Type': contentType
    }
  };
};
