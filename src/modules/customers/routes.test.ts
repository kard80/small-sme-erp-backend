import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./service', () => ({
  customersService: {
    createCustomer: vi.fn(),
    listCustomers: vi.fn(),
    getCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    removeCustomer: vi.fn()
  }
}));

import { createCustomersRouter } from './routes';
import { requireAuth } from '../auth/middleware';
import { fallbackErrorHandler } from '../../shared/http';
import { login } from '../auth/service';
import { customersService } from './service';

const app = express();
app.use(express.json());
app.use('/api/v1/customers', requireAuth, createCustomersRouter());
app.use(fallbackErrorHandler);

const auth = () => ({ Authorization: `Bearer ${login('admin', '1234').accessToken}` });
const oid = 'b'.repeat(24);

beforeEach(() => vi.resetAllMocks());

describe('customers auth gate', () => {
  it('requires a token', async () => {
    expect((await request(app).get('/api/v1/customers')).status).toBe(401);
  });
});

describe('customers routes', () => {
  const body = { customerName: 'a', address: 'b', billName: 'c' };

  it('POST validates and returns 201', async () => {
    expect((await request(app).post('/api/v1/customers').set(auth()).send({})).status).toBe(400);
    vi.mocked(customersService.createCustomer).mockResolvedValue({ _id: oid } as any);
    expect((await request(app).post('/api/v1/customers').set(auth()).send(body)).status).toBe(201);
  });

  it('GET list passes paging; GET :id validates id and 404s', async () => {
    vi.mocked(customersService.listCustomers).mockResolvedValue({ data: [] } as any);
    await request(app).get('/api/v1/customers?page=2&pageSize=5').set(auth());
    expect(customersService.listCustomers).toHaveBeenCalledWith(2, 5);

    expect((await request(app).get('/api/v1/customers/bad').set(auth())).status).toBe(400);
    vi.mocked(customersService.getCustomer).mockResolvedValue(null as any);
    expect((await request(app).get(`/api/v1/customers/${oid}`).set(auth())).status).toBe(404);
  });

  it('PATCH / DELETE handle bad id, missing and success', async () => {
    expect((await request(app).patch('/api/v1/customers/bad').set(auth()).send({})).status).toBe(400);
    vi.mocked(customersService.updateCustomer).mockResolvedValue(null as any);
    expect((await request(app).patch(`/api/v1/customers/${oid}`).set(auth()).send({ billName: 'x' })).status).toBe(404);

    vi.mocked(customersService.removeCustomer).mockResolvedValue(null as any);
    expect((await request(app).delete(`/api/v1/customers/${oid}`).set(auth())).status).toBe(404);
    vi.mocked(customersService.removeCustomer).mockResolvedValue({ _id: oid } as any);
    expect((await request(app).delete(`/api/v1/customers/${oid}`).set(auth())).status).toBe(204);
  });
});

