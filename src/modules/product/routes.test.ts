import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./service', () => ({
  productService: {
    createProduct: vi.fn(),
    importProducts: vi.fn(),
    listProducts: vi.fn(),
    searchProducts: vi.fn(),
    listUnits: vi.fn(),
    getProductOrderHistory: vi.fn(),
    updateProduct: vi.fn(),
    removeProduct: vi.fn()
  }
}));

import { createProductRouter } from './routes';
import { requireAuth } from '../auth/middleware';
import { fallbackErrorHandler } from '../../shared/http';
import { login } from '../auth/service';
import { productService } from './service';

const app = express();
app.use(express.json());
app.use('/api/v1/products', requireAuth, createProductRouter());
app.use(fallbackErrorHandler);

const auth = () => ({ Authorization: `Bearer ${login('admin', '1234').accessToken}` });
const oid = 'b'.repeat(24);

beforeEach(() => vi.resetAllMocks());

describe('products auth gate', () => {
  it('requires a token', async () => {
    expect((await request(app).get('/api/v1/products')).status).toBe(401);
  });
});

describe('product routes', () => {
  it('POST forces status active and validates', async () => {
    expect((await request(app).post('/api/v1/products').set(auth()).send({ productName: 'a' })).status).toBe(400);
    vi.mocked(productService.createProduct).mockResolvedValue({} as any);
    await request(app)
      .post('/api/v1/products')
      .set(auth())
      .send({ productName: 'a', unit: 'kg', sellPrice: 1, status: 'inactive' });
    expect(vi.mocked(productService.createProduct).mock.calls[0][0]).toMatchObject({ status: 'active' });
  });

  it('GET routes to search, unpaginated or paginated list', async () => {
    vi.mocked(productService.searchProducts).mockResolvedValue([] as any);
    vi.mocked(productService.listProducts).mockResolvedValue({} as any);
    await request(app).get('/api/v1/products?search=ab').set(auth());
    expect(productService.searchProducts).toHaveBeenCalledWith('ab');

    await request(app).get('/api/v1/products?countZeroBuyPrice=true').set(auth());
    expect(productService.listProducts).toHaveBeenCalledWith(undefined, undefined, true);

    await request(app).get('/api/v1/products?page=2&pageSize=3').set(auth());
    expect(productService.listProducts).toHaveBeenLastCalledWith(2, 3, false);

    expect((await request(app).get('/api/v1/products?page=0&pageSize=3').set(auth())).status).toBe(400);
  });

  it('GET /units is not swallowed by /:id', async () => {
    vi.mocked(productService.listUnits).mockResolvedValue([{ unitName: 'kg' }] as any);
    const res = await request(app).get('/api/v1/products/units').set(auth());
    expect(res.status).toBe(200);
    expect(productService.getProductOrderHistory).not.toHaveBeenCalled();
  });

  it('GET /:id requires history query params', async () => {
    expect((await request(app).get(`/api/v1/products/${oid}`).set(auth())).status).toBe(400);
    vi.mocked(productService.getProductOrderHistory).mockResolvedValue({} as any);
    const res = await request(app)
      .get(`/api/v1/products/${oid}?deliveryStartDate=2026-01-01&deliveryEndDate=2026-01-31`)
      .set(auth());
    expect(res.status).toBe(200);
  });

  it('PATCH / DELETE handle invalid id, missing and success', async () => {
    expect((await request(app).patch('/api/v1/products/bad').set(auth()).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/v1/products/${oid}`).set(auth()).send({ sellPrice: -1 })).status).toBe(400);
    vi.mocked(productService.updateProduct).mockResolvedValue(null as any);
    expect((await request(app).patch(`/api/v1/products/${oid}`).set(auth()).send({ sellPrice: 1 })).status).toBe(404);
    vi.mocked(productService.removeProduct).mockResolvedValue(true as any);
    expect((await request(app).delete(`/api/v1/products/${oid}`).set(auth())).status).toBe(204);
    vi.mocked(productService.removeProduct).mockResolvedValue(false as any);
    expect((await request(app).delete(`/api/v1/products/${oid}`).set(auth())).status).toBe(404);
  });

  it('import-excel requires a file', async () => {
    expect((await request(app).post('/api/v1/products/import-excel').set(auth())).status).toBe(400);
  });
});

