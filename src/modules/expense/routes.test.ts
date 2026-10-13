import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./service', () => ({
  expenseService: {
    createExpense: vi.fn(),
    listExpenses: vi.fn(),
    getExpense: vi.fn(),
    getSummary: vi.fn(),
    updateExpense: vi.fn(),
    removeExpense: vi.fn()
  }
}));

import { createExpensesRouter } from './routes';
import { requireAuth } from '../auth/middleware';
import { fallbackErrorHandler } from '../../shared/http';
import { login } from '../auth/service';
import { expenseService } from './service';

const app = express();
app.use(express.json());
app.use('/api/v1/expenses', requireAuth, createExpensesRouter());
app.use(fallbackErrorHandler);

const auth = () => ({ Authorization: `Bearer ${login('admin', '1234').accessToken}` });
const oid = 'b'.repeat(24);
const url = '/api/v1/expenses';

beforeEach(() => vi.resetAllMocks());

describe('expenses routes', () => {
  it('requires a token', async () => {
    expect((await request(app).get(url)).status).toBe(401);
  });

  it('POST returns 201 and 400 on invalid amount/missing item', async () => {
    expect((await request(app).post(url).set(auth()).send({ item: 'a', amount: 1.234 })).status).toBe(400);
    expect((await request(app).post(url).set(auth()).send({ amount: 1 })).status).toBe(400);
    vi.mocked(expenseService.createExpense).mockResolvedValue({ _id: oid } as any);
    const res = await request(app).post(url).set(auth()).send({ item: 'a', amount: 12.5, expenseDate: '2026-01-02' });
    expect(res.status).toBe(201);
    expect(vi.mocked(expenseService.createExpense).mock.calls[0][0].expenseDate).toBeInstanceOf(Date);
  });

  it('GET list passes paging; GET :id validates id and 404s', async () => {
    vi.mocked(expenseService.listExpenses).mockResolvedValue({ data: [] } as any);
    await request(app).get(`${url}?page=2&pageSize=5`).set(auth());
    expect(expenseService.listExpenses).toHaveBeenCalledWith(2, 5, undefined, undefined);
    expect((await request(app).get(`${url}/bad`).set(auth())).status).toBe(400);
    vi.mocked(expenseService.getExpense).mockResolvedValue(null as any);
    expect((await request(app).get(`${url}/${oid}`).set(auth())).status).toBe(404);
    vi.mocked(expenseService.getExpense).mockResolvedValue({ _id: oid } as any);
    expect((await request(app).get(`${url}/${oid}`).set(auth())).status).toBe(200);
  });

  it('PATCH handles invalid, success and 404; PUT is not routed', async () => {
    expect((await request(app).patch(`${url}/bad`).set(auth()).send({})).status).toBe(400);
    expect((await request(app).patch(`${url}/${oid}`).set(auth()).send({ amount: -1 })).status).toBe(400);
    vi.mocked(expenseService.updateExpense).mockResolvedValue({ _id: oid } as any);
    expect((await request(app).patch(`${url}/${oid}`).set(auth()).send({ note: '' })).status).toBe(200);
    expect(expenseService.updateExpense).toHaveBeenCalledWith(oid, { note: '' });
    vi.mocked(expenseService.updateExpense).mockResolvedValue(null as any);
    expect((await request(app).patch(`${url}/${oid}`).set(auth()).send({ item: 'x' })).status).toBe(404);
    expect((await request(app).put(`${url}/${oid}`).set(auth()).send({ item: 'x' })).status).toBe(404);
  });

  it('DELETE returns 404 then 204', async () => {
    vi.mocked(expenseService.removeExpense).mockResolvedValue(null as any);
    expect((await request(app).delete(`${url}/${oid}`).set(auth())).status).toBe(404);
    vi.mocked(expenseService.removeExpense).mockResolvedValue({ _id: oid } as any);
    expect((await request(app).delete(`${url}/${oid}`).set(auth())).status).toBe(204);
  });

  it('GET /summary is not swallowed by /:id and validates dates', async () => {
    vi.mocked(expenseService.getSummary).mockResolvedValue({ total: 5, byItem: [] });
    const ok = await request(app).get(`${url}/summary?startDate=2026-01-01`).set(auth());
    expect(ok.status).toBe(200);
    expect(expenseService.getSummary).toHaveBeenCalledWith('2026-01-01', undefined);
    expect((await request(app).get(`${url}/summary?startDate=bad`).set(auth())).status).toBe(400);
  });

  it('GET / passes the date range and rejects a bad one', async () => {
    vi.mocked(expenseService.listExpenses).mockResolvedValue({ data: [] } as any);
    await request(app).get(`${url}?startDate=2026-01-01&endDate=2026-01-31`).set(auth());
    expect(expenseService.listExpenses).toHaveBeenCalledWith(1, 10, '2026-01-01', '2026-01-31');
    expect((await request(app).get(`${url}?endDate=nope`).set(auth())).status).toBe(400);
  });
});
