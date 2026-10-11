import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./services/service', () => ({
  billingNoteService: {
    getBillingNotes: vi.fn(),
    getEligibleOrders: vi.fn(),
    createBillingNote: vi.fn(),
    getBillingNoteDocumentDownloadUrl: vi.fn(),
    manualInsertBillingNote: vi.fn(),
    deleteBillingNote: vi.fn()
  }
}));

import { createBillingNoteRouter } from './routes';
import { requireAuth } from '../auth/middleware';
import { fallbackErrorHandler } from '../../shared/http';
import { login } from '../auth/service';
import { ConflictError } from '../../shared/errors';
import { billingNoteService } from './services/service';

const app = express();
app.use(express.json());
app.use('/api/v1/billing-notes', requireAuth, createBillingNoteRouter());
app.use(fallbackErrorHandler);

const auth = () => ({ Authorization: `Bearer ${login('admin', '1234').accessToken}` });
const oid = 'b'.repeat(24);

beforeEach(() => vi.resetAllMocks());

describe('billing-notes auth gate', () => {
  it('requires a token', async () => {
    expect((await request(app).get('/api/v1/billing-notes')).status).toBe(401);
  });
});

describe('billing-note routes', () => {
  it('GET validates month and strips unexpected fields', async () => {
    expect((await request(app).get('/api/v1/billing-notes').set(auth())).status).toBe(400);
    vi.mocked(billingNoteService.getBillingNotes).mockResolvedValue({
      data: [{ _id: 1, customerId: 2, customerName: 'n', issuedDate: 'd', totalAmount: 3, documentNumber: 'BL', secret: 'x' }],
      total: 1
    } as any);
    const res = await request(app).get('/api/v1/billing-notes?date=2026-01').set(auth());
    expect(res.body.data[0].secret).toBeUndefined();
    expect(res.body.data[0].documentNumber).toBe('BL');
  });

  it('eligible-orders requires all params', async () => {
    expect((await request(app).get('/api/v1/billing-notes/eligible-orders?startDate=2026-01').set(auth())).status).toBe(400);
    vi.mocked(billingNoteService.getEligibleOrders).mockResolvedValue({ data: [] } as any);
    const res = await request(app)
      .get(`/api/v1/billing-notes/eligible-orders?startDate=2026-01&endDate=2026-02&customerId=${oid}`)
      .set(auth());
    expect(res.status).toBe(200);
  });

  it('POST validates and returns 201', async () => {
    expect((await request(app).post('/api/v1/billing-notes').set(auth()).send({ orderIds: [] })).status).toBe(400);
    vi.mocked(billingNoteService.createBillingNote).mockResolvedValue({ _id: oid } as any);
    const res = await request(app)
      .post('/api/v1/billing-notes')
      .set(auth())
      .send({ issuedDate: '2026-01-01', customerId: oid, orderIds: [oid] });
    expect(res.status).toBe(201);
  });

  it('document, regenerate-document and delete validate id and map statuses', async () => {
    expect((await request(app).get('/api/v1/billing-notes/bad/document').set(auth())).status).toBe(400);
    expect((await request(app).post('/api/v1/billing-notes/bad/regenerate-document').set(auth())).status).toBe(400);
    expect((await request(app).delete('/api/v1/billing-notes/bad').set(auth())).status).toBe(400);

    vi.mocked(billingNoteService.manualInsertBillingNote).mockResolvedValue({ documentPath: 'x' });
    expect((await request(app).post(`/api/v1/billing-notes/${oid}/regenerate-document`).set(auth())).status).toBe(201);

    vi.mocked(billingNoteService.deleteBillingNote).mockResolvedValue(undefined);
    expect((await request(app).delete(`/api/v1/billing-notes/${oid}`).set(auth())).status).toBe(204);

    vi.mocked(billingNoteService.deleteBillingNote).mockRejectedValue(new ConflictError());
    expect((await request(app).delete(`/api/v1/billing-notes/${oid}`).set(auth())).status).toBe(409);
  });
});

