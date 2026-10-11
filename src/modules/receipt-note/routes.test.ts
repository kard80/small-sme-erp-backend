import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./services/service', () => ({
  receiptNoteService: {
    getReceiptNotes: vi.fn(),
    getEligibleBillingNotes: vi.fn(),
    createReceiptNote: vi.fn(),
    getReceiptNoteDetail: vi.fn(),
    getReceiptNoteDocumentDownloadUrl: vi.fn(),
    manualInsertReceiptNote: vi.fn(),
    deleteReceiptNote: vi.fn()
  }
}));

import { createReceiptNoteRouter } from './routes';
import { requireAuth } from '../auth/middleware';
import { fallbackErrorHandler } from '../../shared/http';
import { login } from '../auth/service';
import { NotFoundError } from '../../shared/errors';
import { receiptNoteService } from './services/service';

const app = express();
app.use(express.json());
app.use('/api/v1/receipt-notes', requireAuth, createReceiptNoteRouter());
app.use(fallbackErrorHandler);

const auth = () => ({ Authorization: `Bearer ${login('admin', '1234').accessToken}` });
const oid = 'b'.repeat(24);

beforeEach(() => vi.resetAllMocks());

describe('receipt-notes auth gate', () => {
  it('requires a token', async () => {
    expect((await request(app).get('/api/v1/receipt-notes')).status).toBe(401);
  });
});

describe('receipt-note routes', () => {
  it('GET validates month and projects fields', async () => {
    expect((await request(app).get('/api/v1/receipt-notes?date=bad').set(auth())).status).toBe(400);
    vi.mocked(receiptNoteService.getReceiptNotes).mockResolvedValue({
      data: [{ _id: 1, customerId: 2, customerName: 'n', receiptDate: 'd', totalAmount: 3, documentNumber: 'RC', secret: 'x' }]
    } as any);
    const res = await request(app).get('/api/v1/receipt-notes?date=2026-01').set(auth());
    expect(res.body.data[0].secret).toBeUndefined();
  });

  it('eligible-billing-notes requires all params and is not swallowed by /:id', async () => {
    expect((await request(app).get('/api/v1/receipt-notes/eligible-billing-notes').set(auth())).status).toBe(400);
    vi.mocked(receiptNoteService.getEligibleBillingNotes).mockResolvedValue({ data: [] } as any);
    const res = await request(app)
      .get(`/api/v1/receipt-notes/eligible-billing-notes?startDate=2026-01&endDate=2026-02&customerId=${oid}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(receiptNoteService.getReceiptNoteDetail).not.toHaveBeenCalled();
  });

  it('POST validates and returns 201', async () => {
    expect((await request(app).post('/api/v1/receipt-notes').set(auth()).send({})).status).toBe(400);
    vi.mocked(receiptNoteService.createReceiptNote).mockResolvedValue({ _id: oid } as any);
    const res = await request(app)
      .post('/api/v1/receipt-notes')
      .set(auth())
      .send({ receiptDate: '2026-01-01', customerId: oid, billingNoteIds: [oid] });
    expect(res.status).toBe(201);
  });

  it('detail, document, regenerate and delete', async () => {
    expect((await request(app).get('/api/v1/receipt-notes/bad').set(auth())).status).toBe(400);
    vi.mocked(receiptNoteService.getReceiptNoteDetail).mockResolvedValue({
      _id: oid, customerId: oid, customerName: 'n', receiptDate: 'd', totalAmount: 1, documentNumber: 'RC',
      billingNotes: [{ _id: 1, documentNumber: 'BL', issuedDate: 'd', totalAmount: 1, secret: 'x' }]
    } as any);
    const detail = await request(app).get(`/api/v1/receipt-notes/${oid}`).set(auth());
    expect(detail.body.billingNotes[0].secret).toBeUndefined();

    vi.mocked(receiptNoteService.manualInsertReceiptNote).mockResolvedValue({} as any);
    expect((await request(app).post(`/api/v1/receipt-notes/${oid}/regenerate-document`).set(auth())).status).toBe(201);
    vi.mocked(receiptNoteService.deleteReceiptNote).mockResolvedValue(undefined);
    expect((await request(app).delete(`/api/v1/receipt-notes/${oid}`).set(auth())).status).toBe(204);
    vi.mocked(receiptNoteService.getReceiptNoteDocumentDownloadUrl).mockRejectedValue(new NotFoundError());
    expect((await request(app).get(`/api/v1/receipt-notes/${oid}/document`).set(auth())).status).toBe(404);
  });
});

