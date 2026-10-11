import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./service', () => ({
  photoImportsService: { upload: vi.fn(), list: vi.fn(), get: vi.fn(), retry: vi.fn(), consume: vi.fn(), remove: vi.fn() }
}));

import { createPhotoImportsRouter } from './routes';
import { requireAuth } from '../auth/middleware';
import { fallbackErrorHandler } from '../../shared/http';
import { login } from '../auth/service';
import { photoImportsService } from './service';

const app = express();
app.use('/api/v1/photo-imports', requireAuth, createPhotoImportsRouter());
app.use(fallbackErrorHandler);

const auth = () => ({ Authorization: `Bearer ${login('admin', '1234').accessToken}` });
const oid = 'c'.repeat(24);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

beforeEach(() => vi.resetAllMocks());

describe('photo-imports routes', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/v1/photo-imports')).status).toBe(401);
  });

  it('POST returns 201 and passes the user and file', async () => {
    vi.mocked(photoImportsService.upload).mockResolvedValue({ id: oid, status: 'processing' } as any);
    const res = await request(app)
      .post('/api/v1/photo-imports')
      .set(auth())
      .attach('image', jpeg, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: oid, status: 'processing' });
    expect(vi.mocked(photoImportsService.upload).mock.calls[0][0]).toBe('admin');
    expect(vi.mocked(photoImportsService.upload).mock.calls[0][1]?.mimetype).toBe('image/jpeg');
  });

  it('POST surfaces service validation errors (bad mime)', async () => {
    const { BadRequestError } = await import('../../shared/errors');
    vi.mocked(photoImportsService.upload).mockRejectedValue(new BadRequestError('bad'));
    const res = await request(app)
      .post('/api/v1/photo-imports')
      .set(auth())
      .attach('image', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('POST rejects files over 10 MB with 413', async () => {
    const res = await request(app)
      .post('/api/v1/photo-imports')
      .set(auth())
      .attach('image', Buffer.alloc(10 * 1024 * 1024 + 1), { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(413);
    expect(photoImportsService.upload).not.toHaveBeenCalled();
  });

  it('GET list validates status and scopes to the user', async () => {
    expect((await request(app).get('/api/v1/photo-imports?status=x').set(auth())).status).toBe(400);
    vi.mocked(photoImportsService.list).mockResolvedValue([]);
    const res = await request(app).get('/api/v1/photo-imports?status=ready').set(auth());
    expect(res.status).toBe(200);
    expect(photoImportsService.list).toHaveBeenCalledWith('admin', 'ready');
  });

  it('GET :id, retry and consume validate the id and call the service', async () => {
    expect((await request(app).get('/api/v1/photo-imports/bad').set(auth())).status).toBe(400);
    vi.mocked(photoImportsService.get).mockResolvedValue({ id: oid } as any);
    expect((await request(app).get(`/api/v1/photo-imports/${oid}`).set(auth())).status).toBe(200);
    vi.mocked(photoImportsService.retry).mockResolvedValue({ id: oid, status: 'processing' });
    expect((await request(app).post(`/api/v1/photo-imports/${oid}/retry`).set(auth())).status).toBe(200);
    vi.mocked(photoImportsService.consume).mockResolvedValue({ id: oid, status: 'consumed' });
    expect((await request(app).post(`/api/v1/photo-imports/${oid}/consume`).set(auth())).status).toBe(200);
  });

  it('DELETE :id validates the id and returns 204', async () => {
    expect((await request(app).delete('/api/v1/photo-imports/bad').set(auth())).status).toBe(400);
    vi.mocked(photoImportsService.remove).mockResolvedValue(undefined);
    const res = await request(app).delete(`/api/v1/photo-imports/${oid}`).set(auth());
    expect(res.status).toBe(204);
    expect(vi.mocked(photoImportsService.remove).mock.calls[0]).toEqual(['admin', oid]);
  });
});
