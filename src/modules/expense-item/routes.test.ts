import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./service', () => ({
  expenseItemService: {
    createExpenseItem: vi.fn(),
    listExpenseItems: vi.fn(),
    updateExpenseItem: vi.fn(),
    removeExpenseItem: vi.fn()
  }
}));

import { createExpenseItemsRouter } from './routes';
import { requireAuth } from '../auth/middleware';
import { fallbackErrorHandler } from '../../shared/http';
import { login } from '../auth/service';
import { ConflictError } from '../../shared/errors';
import { expenseItemService } from './service';

const app = express();
app.use(express.json());
app.use('/api/v1/expense-items', requireAuth, createExpenseItemsRouter());
app.use(fallbackErrorHandler);

const auth = () => ({ Authorization: `Bearer ${login('admin', '1234').accessToken}` });
const oid = 'c'.repeat(24);
const url = '/api/v1/expense-items';

beforeEach(() => vi.resetAllMocks());

describe('expense-items routes', () => {
  it('requires a token', async () => {
    expect((await request(app).get(url)).status).toBe(401);
  });

  it('GET lists presets', async () => {
    vi.mocked(expenseItemService.listExpenseItems).mockResolvedValue([{ itemName: 'ค่าน้ำ' }] as any);
    const res = await request(app).get(url).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST validates, creates, and maps duplicates to 409', async () => {
    expect((await request(app).post(url).set(auth()).send({ itemName: '  ' })).status).toBe(400);
    vi.mocked(expenseItemService.createExpenseItem).mockResolvedValueOnce({ _id: oid } as any);
    expect((await request(app).post(url).set(auth()).send({ itemName: 'ค่าไฟ' })).status).toBe(201);
    vi.mocked(expenseItemService.createExpenseItem).mockRejectedValueOnce(new ConflictError('x'));
    expect((await request(app).post(url).set(auth()).send({ itemName: 'ค่าไฟ' })).status).toBe(409);
  });

  it('PATCH and DELETE return 404 when missing', async () => {
    vi.mocked(expenseItemService.updateExpenseItem).mockResolvedValue(null);
    vi.mocked(expenseItemService.removeExpenseItem).mockResolvedValue(null);
    expect((await request(app).patch(`${url}/${oid}`).set(auth()).send({ itemName: 'a' })).status).toBe(404);
    expect((await request(app).delete(`${url}/${oid}`).set(auth())).status).toBe(404);
    vi.mocked(expenseItemService.removeExpenseItem).mockResolvedValue({ _id: oid } as any);
    expect((await request(app).delete(`${url}/${oid}`).set(auth())).status).toBe(204);
  });
});
