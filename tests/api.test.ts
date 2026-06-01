import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createErpMcpServer } from '../src/mcpApp';
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
      'parse-order-text',
      'orders.insert'
    ]));

    const parsed = await client.callTool({
      name: 'parse-order-text',
      arguments: {
        text: 'productId: 1\nproductName: Widget\nunit: pcs\nbuyPrice: 10\nsellPrice: 20\ncustomerId: 2\ndueDate: 2026-06-20\nstatus: pending'
      }
    });

    expect(parsed.structuredContent?.orderDraft).toMatchObject({
      productName: 'Widget',
      sellPrice: 20
    });

    const inserted = await client.callTool({
      name: 'orders.insert',
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
    expect(tools.tools.map((tool) => tool.name)).toContain('parse-order-image');

    const parsed = await client.callTool({
      name: 'parse-order-image',
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
