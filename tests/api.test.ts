import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMcpApp } from '../src/mcpApp';
import { createRestApp } from '../src/restApp';
import { db } from '../src/store';

const resetDb = () => {
  db.products.length = 0;
  db.customers.length = 0;
  db.orders.length = 0;
  db.customerCredits.length = 0;
  db.financials.length = 0;
};

describe('ERP backend', () => {
  beforeEach(() => {
    resetDb();
  });

  it('creates order via REST and auto-creates customer credit', async () => {
    const app = createRestApp();

    const response = await request(app).post('/orders').send({
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

    const created = await request(app).post('/orders').send({
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

    const partial = await request(app).post('/financials').send({
      customerCreditId: creditId,
      amount: 50,
      paymentDate: '2026-06-01'
    });

    expect(partial.status).toBe(201);
    expect(db.customerCredits[0].status).toBe('pending');
    expect(db.customerCredits[0].paidAmount).toBe(50);

    const complete = await request(app).post('/financials').send({
      customerCreditId: creditId,
      amount: 100,
      paymentDate: '2026-06-02'
    });

    expect(complete.status).toBe(201);
    expect(db.customerCredits[0].status).toBe('paid');
    expect(db.orders[0].status).toBe('completed');
  });

  it('parses image text and inserts order via MCP endpoints', async () => {
    const mcpApp = createMcpApp();

    const parsed = await request(mcpApp).post('/tools/parse-order-image-text').send({
      text: 'productId: 1\nproductName: Widget\nunit: pcs\nbuyPrice: 10\nsellPrice: 20\ncustomerId: 2\ndueDate: 2026-06-20\nstatus: pending'
    });

    expect(parsed.status).toBe(200);
    expect(parsed.body.orderDraft.productName).toBe('Widget');

    const inserted = await request(mcpApp).post('/tools/orders.insert').send(parsed.body.orderDraft);

    expect(inserted.status).toBe(201);
    expect(inserted.body.credit.totalAmount).toBe(20);
  });
});
