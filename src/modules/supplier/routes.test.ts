import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./service', () => ({
  supplierService: {
    createSupplier: vi.fn(),
    listSuppliers: vi.fn(),
    getSupplier: vi.fn(),
    updateSupplier: vi.fn(),
    removeSupplier: vi.fn(),
    listProductsOfSupplier: vi.fn(),
    replaceProductsOfSupplier: vi.fn()
  }
}));

import { createSuppliersRouter } from './routes';
import { requireAuth } from '../auth/middleware';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { fallbackErrorHandler } from '../../shared/http';
import { login } from '../auth/service';
import { supplierService } from './service';

const app = express();
app.use(express.json());
app.use('/api/v1/suppliers', requireAuth, createSuppliersRouter());
app.use(fallbackErrorHandler);

const auth = () => ({ Authorization: `Bearer ${login('admin', '1234').accessToken}` });
const oid = 'b'.repeat(24);
const url = '/api/v1/suppliers';

beforeEach(() => vi.resetAllMocks());

describe('suppliers routes', () => {
  it('requires a token', async () => {
    expect((await request(app).get(url)).status).toBe(401);
  });

  it('POST returns 201, 400 on invalid, 409 on duplicate', async () => {
    expect((await request(app).post(url).set(auth()).send({})).status).toBe(400);
    vi.mocked(supplierService.createSupplier).mockResolvedValue({ _id: oid } as any);
    expect((await request(app).post(url).set(auth()).send({ supplierName: 'A' })).status).toBe(201);

    vi.mocked(supplierService.createSupplier).mockRejectedValue(new ConflictError('ชื่อผู้ขายนี้มีอยู่แล้ว'));
    const res = await request(app).post(url).set(auth()).send({ supplierName: 'A' });
    expect(res.status).toBe(409);
  });

  it('GET list passes paging; GET :id validates id and 404s', async () => {
    vi.mocked(supplierService.listSuppliers).mockResolvedValue({ data: [] } as any);
    await request(app).get(`${url}?page=2&pageSize=5`).set(auth());
    expect(supplierService.listSuppliers).toHaveBeenCalledWith(2, 5);

    expect((await request(app).get(`${url}/bad`).set(auth())).status).toBe(400);
    vi.mocked(supplierService.getSupplier).mockResolvedValue(null as any);
    expect((await request(app).get(`${url}/${oid}`).set(auth())).status).toBe(404);
  });

  it('PATCH handles invalid, clearing, 404 and 409', async () => {
    expect((await request(app).patch(`${url}/bad`).set(auth()).send({})).status).toBe(400);
    expect((await request(app).patch(`${url}/${oid}`).set(auth()).send({ supplierName: '' })).status).toBe(400);

    vi.mocked(supplierService.updateSupplier).mockResolvedValue({ _id: oid } as any);
    expect((await request(app).patch(`${url}/${oid}`).set(auth()).send({ phone: '', remark: '' })).status).toBe(200);
    expect(supplierService.updateSupplier).toHaveBeenCalledWith(oid, { phone: '', remark: '' });

    vi.mocked(supplierService.updateSupplier).mockResolvedValue(null as any);
    expect((await request(app).patch(`${url}/${oid}`).set(auth()).send({ phone: 'x' })).status).toBe(404);

    vi.mocked(supplierService.updateSupplier).mockRejectedValue(new ConflictError());
    expect((await request(app).patch(`${url}/${oid}`).set(auth()).send({ supplierName: 'A' })).status).toBe(409);
  });

  it('DELETE returns 404 then 204', async () => {
    vi.mocked(supplierService.removeSupplier).mockResolvedValue(null as any);
    expect((await request(app).delete(`${url}/${oid}`).set(auth())).status).toBe(404);
    vi.mocked(supplierService.removeSupplier).mockResolvedValue({ _id: oid } as any);
    expect((await request(app).delete(`${url}/${oid}`).set(auth())).status).toBe(204);
  });

  it('GET/PUT :id/products validate input and map 404', async () => {
    vi.mocked(supplierService.listProductsOfSupplier).mockRejectedValue(new NotFoundError('ไม่พบผู้ขาย'));
    expect((await request(app).get(`${url}/${oid}/products`).set(auth())).status).toBe(404);

    expect((await request(app).put(`${url}/${oid}/products`).set(auth()).send({})).status).toBe(400);
    expect((await request(app).put(`${url}/${oid}/products`).set(auth()).send([{ productId: 'x', priority: 1 }])).status).toBe(400);

    vi.mocked(supplierService.replaceProductsOfSupplier).mockRejectedValue(new NotFoundError('ไม่พบผู้ขาย'));
    const body = [{ productId: oid, priority: 1 }];
    expect((await request(app).put(`${url}/${oid}/products`).set(auth()).send(body)).status).toBe(404);

    vi.mocked(supplierService.replaceProductsOfSupplier).mockResolvedValue([] as any);
    expect((await request(app).put(`${url}/${oid}/products`).set(auth()).send(body)).status).toBe(200);
  });
});
