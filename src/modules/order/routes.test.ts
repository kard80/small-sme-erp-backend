import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./service', () => ({
  orderService: {
    createOrder: vi.fn(),
    listOrders: vi.fn(),
    getSummary: vi.fn(),
    getDeliveryNoteDownloadUrl: vi.fn(),
    getPurchaseListPdf: vi.fn(),
    getCombinedPurchaseListPdf: vi.fn(),
    renderCustomReceipt: vi.fn(),
    createDeliveryNote: vi.fn(),
    getOrderWithItems: vi.fn(),
    updateOrder: vi.fn(),
    removeOrder: vi.fn()
  }
}));

import { createOrderRouter } from './routes';
import { requireAuth } from '../auth/middleware';
import { fallbackErrorHandler } from '../../shared/http';
import { login } from '../auth/service';
import { NotFoundError } from '../../shared/errors';
import { orderService } from './service';

const app = express();
app.use(express.json());
app.use('/api/v1/orders', requireAuth, createOrderRouter());
app.use(fallbackErrorHandler);

const auth = () => ({ Authorization: `Bearer ${login('admin', '1234').accessToken}` });
const oid = 'b'.repeat(24);

beforeEach(() => vi.resetAllMocks());

describe('orders auth gate', () => {
  it('requires a token', async () => {
    expect((await request(app).get('/api/v1/orders')).status).toBe(401);
  });
});

describe('order routes', () => {
  const body = {
    customerId: oid,
    dueDate: '2026-02-01',
    deliveryDate: '2026-01-31',
    status: 'draft',
    items: [{ productId: oid, productName: 'a', unit: 'kg', quantity: 1, buyPrice: 0, sellPrice: 1 }]
  };

  it('POST validates (field-keyed errors) and returns 201', async () => {
    const bad = await request(app).post('/api/v1/orders').set(auth()).send({ ...body, items: [] });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.items).toBeDefined();

    vi.mocked(orderService.createOrder).mockResolvedValue({} as any);
    expect((await request(app).post('/api/v1/orders').set(auth()).send(body)).status).toBe(201);
  });

  it('GET builds a delivery date range and completed filter', async () => {
    vi.mocked(orderService.listOrders).mockResolvedValue({ data: [] } as any);
    await request(app)
      .get('/api/v1/orders?deliveryDateStart=2026-01-01&deliveryDateEnd=2026-01-31&status=completed')
      .set(auth());

    const arg = vi.mocked(orderService.listOrders).mock.calls[0][0] as any;
    expect(arg.where.deliveryDate.$gte).toBeInstanceOf(Date);
    expect(arg.where.deliveryDate.$lte.getTime()).toBeGreaterThan(arg.where.deliveryDate.$gte.getTime());
    expect(arg.where.completedAt.$ne).toBeNull();
  });

  it('GET ignores a half-specified date range', async () => {
    vi.mocked(orderService.listOrders).mockResolvedValue({ data: [] } as any);
    await request(app).get('/api/v1/orders?deliveryDateStart=2026-01-01').set(auth());
    expect((vi.mocked(orderService.listOrders).mock.calls[0][0] as any).where).toEqual({});
  });

  it('GET /summary is not swallowed by /:orderId', async () => {
    vi.mocked(orderService.getSummary).mockResolvedValue({ revenue: 1 } as any);
    const res = await request(app).get('/api/v1/orders/summary?startDate=2026-01-01').set(auth());
    expect(res.status).toBe(200);
    expect(orderService.getSummary).toHaveBeenCalledWith('2026-01-01', undefined);
  });

  it('id-based routes validate ObjectIds and 404 when missing', async () => {
    expect((await request(app).get('/api/v1/orders/bad').set(auth())).status).toBe(400);
    expect((await request(app).get('/api/v1/orders/bad/delivery-note').set(auth())).status).toBe(400);
    expect((await request(app).post('/api/v1/orders/bad/delivery-note').set(auth())).status).toBe(400);
    expect((await request(app).patch('/api/v1/orders/bad').set(auth()).send({})).status).toBe(400);
    expect((await request(app).delete('/api/v1/orders/bad').set(auth())).status).toBe(400);

    vi.mocked(orderService.getOrderWithItems).mockResolvedValue(undefined);
    vi.mocked(orderService.createDeliveryNote).mockResolvedValue(undefined);
    vi.mocked(orderService.updateOrder).mockResolvedValue(undefined);
    vi.mocked(orderService.removeOrder).mockResolvedValue(undefined);
    expect((await request(app).get(`/api/v1/orders/${oid}`).set(auth())).status).toBe(404);
    expect((await request(app).post(`/api/v1/orders/${oid}/delivery-note`).set(auth())).status).toBe(404);
    expect((await request(app).patch(`/api/v1/orders/${oid}`).set(auth()).send({})).status).toBe(404);
    expect((await request(app).delete(`/api/v1/orders/${oid}`).set(auth())).status).toBe(404);
  });

  it('delete returns 204 and service errors surface their status', async () => {
    vi.mocked(orderService.removeOrder).mockResolvedValue({} as any);
    expect((await request(app).delete(`/api/v1/orders/${oid}`).set(auth())).status).toBe(204);

    vi.mocked(orderService.getDeliveryNoteDownloadUrl).mockRejectedValue(new NotFoundError('nf'));
    const res = await request(app).get(`/api/v1/orders/${oid}/delivery-note`).set(auth());
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'nf' });
  });
});


describe('GET /:orderId/purchase-list', () => {
  it('streams a pdf attachment', async () => {
    vi.mocked(orderService.getPurchaseListPdf).mockResolvedValue(Buffer.from('%PDF'));
    const res = await request(app).get(`/api/v1/orders/${oid}/purchase-list`).set(auth());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="purchase-list-${oid}.pdf"`);
  });

  it('400 on bad id, 404 when missing, 401 without token', async () => {
    expect((await request(app).get('/api/v1/orders/zz/purchase-list').set(auth())).status).toBe(400);
    vi.mocked(orderService.getPurchaseListPdf).mockRejectedValue(new NotFoundError('ไม่พบคำสั่งซื้อ'));
    const res = await request(app).get(`/api/v1/orders/${oid}/purchase-list`).set(auth());
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'ไม่พบคำสั่งซื้อ' });
    expect((await request(app).get(`/api/v1/orders/${oid}/purchase-list`)).status).toBe(401);
  });
});

describe('POST /orders/purchase-lists/combined', () => {
  it('rejects an empty orderIds list', async () => {
    const res = await request(app).post('/api/v1/orders/purchase-lists/combined').set(auth()).send({ orderIds: [] });
    expect(res.status).toBe(400);
  });

  it('returns the merged pdf', async () => {
    vi.mocked(orderService.getCombinedPurchaseListPdf).mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    const res = await request(app).post('/api/v1/orders/purchase-lists/combined').set(auth()).send({ orderIds: [oid] });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(orderService.getCombinedPurchaseListPdf).toHaveBeenCalledWith([oid], undefined);
  });

  it('passes the supplier selection through and rejects bad ids', async () => {
    vi.mocked(orderService.getCombinedPurchaseListPdf).mockResolvedValue(new Uint8Array([37]));
    const ok = await request(app).post('/api/v1/orders/purchase-lists/combined').set(auth()).send({ orderIds: [oid], supplierIds: [oid, 'none'] });
    expect(ok.status).toBe(200);
    expect(orderService.getCombinedPurchaseListPdf).toHaveBeenCalledWith([oid], [oid, 'none']);
    const bad = await request(app).post('/api/v1/orders/purchase-lists/combined').set(auth()).send({ orderIds: [oid], supplierIds: ['x'] });
    expect(bad.status).toBe(400);
  });
});

describe('POST /orders/custom-receipt', () => {
  const body = {
    documentNumber: 'RC-001',
    issuedDate: '2026-10-28',
    customerName: 'เรือนจำจังหวัดสระแก้ว',
    items: [{ productName: 'ข้าวสาร', unit: 'กก.', quantity: 2, sellPrice: 35.5 }]
  };

  it('rejects empty items and missing customer name', async () => {
    expect((await request(app).post('/api/v1/orders/custom-receipt').set(auth()).send({ ...body, items: [] })).status).toBe(400);
    expect((await request(app).post('/api/v1/orders/custom-receipt').set(auth()).send({ ...body, customerName: '' })).status).toBe(400);
  });

  it('rejects an invalid date and oversized item lists', async () => {
    expect((await request(app).post('/api/v1/orders/custom-receipt').set(auth()).send({ ...body, issuedDate: 'abc' })).status).toBe(400);
    const items = Array.from({ length: 201 }, () => body.items[0]);
    expect((await request(app).post('/api/v1/orders/custom-receipt').set(auth()).send({ ...body, items })).status).toBe(400);
  });

  it('returns the pdf without touching the db layer', async () => {
    vi.mocked(orderService.renderCustomReceipt).mockResolvedValue(Buffer.from('%PDF'));
    const res = await request(app).post('/api/v1/orders/custom-receipt').set(auth()).send(body);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(orderService.renderCustomReceipt).toHaveBeenCalledWith(expect.objectContaining({ customerAddress: '', documentNumber: 'RC-001' }));
  });
});
