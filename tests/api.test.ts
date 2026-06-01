import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createErpMcpServer } from '../src/mcpApp';
import { createRestApp } from '../src/restApp';
import { db, resetInMemoryStore } from '../src/store';

const resetDb = () => resetInMemoryStore();

const loginAsAdmin = async (app: ReturnType<typeof createRestApp>) => {
  const response = await request(app).post('/api/auth/login').send({
    username: 'admin',
    password: '1234'
  });

  expect(response.status).toBe(200);
  expect(response.body.accessToken).toBeDefined();
  expect(response.body.refreshToken).toBeDefined();
  return response.body as {
    accessToken: string;
    refreshToken: string;
  };
};

describe('ERP backend', () => {
  beforeEach(() => {
    resetDb();
  });

  it('creates order via REST and auto-creates customer credit', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const response = await request(app)
      .post('/api/sales/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productId: 1,
        productName: 'Widget A',
        unit: 'pcs',
        buyPrice: 100,
        sellPrice: 150,
        customerId: 99,
        dueDate: '2026-06-30',
        status: 'pending'
      });

    expect(response.status).toBe(201);
    expect(response.body.order.id).toBeDefined();
    expect(response.body.credit.totalAmount).toBe(150);
    expect(response.body.credit.status).toBe('pending');
  });

  it('supports partial and full payment in financial transactions', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await request(app)
      .post('/api/sales/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productId: 1,
        productName: 'Widget A',
        unit: 'pcs',
        buyPrice: 100,
        sellPrice: 150,
        customerId: 99,
        dueDate: '2026-06-30',
        status: 'pending'
      });

    const creditId = created.body.credit.id;

    const partial = await request(app)
      .post('/api/finance/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: creditId,
        amount: 50,
        paymentDate: '2026-06-01'
      });

    expect(partial.status).toBe(201);
    expect(db.customerCredits[0].status).toBe('pending');
    expect(db.customerCredits[0].paidAmount).toBe(50);

    const complete = await request(app)
      .post('/api/finance/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: creditId,
        amount: 100,
        paymentDate: '2026-06-02'
      });

    expect(complete.status).toBe(201);
    expect(db.customerCredits[0].status).toBe('paid');
    expect(db.orders[0].status).toBe('completed');
  });

  it('authenticates REST requests with access and refresh tokens', async () => {
    const app = createRestApp();

    const missingToken = await request(app).get('/api/catalog/products');
    expect(missingToken.status).toBe(401);

    const badLogin = await request(app).post('/api/auth/login').send({
      username: 'admin',
      password: 'wrong'
    });
    expect(badLogin.status).toBe(401);

    const tokens = await loginAsAdmin(app);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({
      id: 'admin',
      username: 'admin'
    });

    const refreshed = await request(app).post('/api/auth/refresh').send({
      refreshToken: tokens.refreshToken
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeDefined();
    expect(refreshed.body.refreshToken).toBeDefined();
    expect(refreshed.body.expiresIn).toBe(900);
    expect(refreshed.body.refreshExpiresIn).toBe(86400);

    const invalidRefresh = await request(app).post('/api/auth/refresh').send({
      refreshToken: tokens.accessToken
    });
    expect(invalidRefresh.status).toBe(401);

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(logout.status).toBe(200);
    expect(logout.body.ok).toBe(true);

    const logoutWithoutToken = await request(app).post('/api/auth/logout');
    expect(logoutWithoutToken.status).toBe(401);
  });

  it('deletes an order with linked customer credit and payments', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await request(app)
      .post('/api/sales/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productId: 1,
        productName: 'Widget A',
        unit: 'pcs',
        buyPrice: 100,
        sellPrice: 150,
        customerId: 99,
        dueDate: '2026-06-30',
        status: 'pending'
      });

    await request(app)
      .post('/api/finance/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: created.body.credit.id,
        amount: 50,
        paymentDate: '2026-06-01'
      });

    const removed = await request(app)
      .delete(`/api/sales/orders/${created.body.order.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(removed.status).toBe(204);
    expect(db.orders).toHaveLength(0);
    expect(db.customerCredits).toHaveLength(0);
    expect(db.financials).toHaveLength(0);
  });

  it('rejects payments against cancelled customer credit', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await request(app)
      .post('/api/credit/customer-credits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        orderId: 1,
        customerId: 99,
        totalAmount: 150,
        paidAmount: 0,
        status: 'cancelled'
      });

    const payment = await request(app)
      .post('/api/finance/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: created.body.id,
        amount: 50,
        paymentDate: '2026-06-01'
      });

    expect(payment.status).toBe(400);
    expect(payment.body.error).toBe('Cannot pay cancelled customer credit');
  });

  it('parses text and inserts order via MCP tools', async () => {
    const mcpServer = createErpMcpServer();
    const client = new Client({ name: 'erp-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      mcpServer.connect(serverTransport)
    ]);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'sales.orders.parseText',
      'sales.orders.create'
    ]));

    const parsed = await client.callTool({
      name: 'sales.orders.parseText',
      arguments: {
        text: 'productId: 1\nproductName: Widget\nunit: pcs\nbuyPrice: 10\nsellPrice: 20\ncustomerId: 2\ndueDate: 2026-06-20\nstatus: pending'
      }
    });

    expect(parsed.structuredContent?.orderDraft).toMatchObject({
      productName: 'Widget',
      sellPrice: 20
    });

    const inserted = await client.callTool({
      name: 'sales.orders.create',
      arguments: parsed.structuredContent?.orderDraft as Record<string, unknown>
    });

    expect(inserted.structuredContent?.credit).toMatchObject({
      totalAmount: 20,
      status: 'pending'
    });

    await client.close();
    await mcpServer.close();
  });

  it('accepts order images via MCP and reports OCR is not configured', async () => {
    const mcpServer = createErpMcpServer();
    const client = new Client({ name: 'erp-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      mcpServer.connect(serverTransport)
    ]);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain('sales.orders.parseImage');

    const parsed = await client.callTool({
      name: 'sales.orders.parseImage',
      arguments: {
        imageBase64: Buffer.from('fake-image').toString('base64'),
        mimeType: 'image/png'
      }
    });

    expect(parsed.isError).toBe(true);
    expect(parsed.structuredContent).toMatchObject({
      status: 'ocr_not_configured',
      acceptedImage: {
        mimeType: 'image/png',
        byteLength: 10
      }
    });

    await client.close();
    await mcpServer.close();
  });
});
