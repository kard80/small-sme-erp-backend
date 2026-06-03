import request from 'supertest';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { extractProductImportRows } from '../src/modules/product/routes';
import {
  initiateDb,
  disconnectPersistence,
  CustomerModel,
  CustomerCreditModel,
  OrderItemModel,
  OrderModel,
  PaymentTransactionModel,
  ProductModel
} from '../src/shared/persistence';
import { createRestApp } from '../src/restApp';
import { productService } from '../src/modules/product/service';

const describeIfMongo = process.env.MONGODB_URI ? describe : describe.skip;
const testProductId = new Types.ObjectId().toString();

const loginAsAdmin = async (app: ReturnType<typeof createRestApp>) => {
  const response = await request(app).post('/api/v1/auth/login').send({
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

const createOrder = async (
  app: ReturnType<typeof createRestApp>,
  accessToken: string,
  overrides: Partial<{
    customerId: number;
    dueDate: string;
    deliveryDate: string;
    status: 'draft' | 'completed';
    items: Array<{
      productId: string;
      productName: string;
      unit: string;
      quantity: number;
      buyPrice: number;
      sellPrice: number;
    }>;
  }> = {}
) => {
  return request(app)
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      customerId: 99,
      dueDate: '2026-06-30',
      deliveryDate: '2026-06-20',
      status: 'draft',
      items: [
        {
          productId: testProductId,
          productName: 'Widget A',
          unit: 'pcs',
          quantity: 1,
          buyPrice: 100,
          sellPrice: 150
        }
      ],
      ...overrides
    });
};

describeIfMongo('ERP backend', () => {
  beforeAll(async () => {
    await initiateDb();
  });

  beforeEach(async () => {
    await Promise.all([
      CustomerModel.deleteMany({}),
      ProductModel.deleteMany({}),
      PaymentTransactionModel.deleteMany({}),
      CustomerCreditModel.deleteMany({}),
      OrderItemModel.deleteMany({}),
      OrderModel.deleteMany({})
    ]);
  });

  afterAll(async () => {
    await disconnectPersistence();
  });

  it('creates a draft order with order items only', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const response = await createOrder(app, accessToken);

    expect(response.status).toBe(201);
    expect(response.body.order._id).toEqual(expect.any(String));
    expect(response.body.order.createdAt).toEqual(expect.any(String));
    expect(response.body.order.completedAt).toBeNull();
    expect(response.body.order.cancelledAt).toBeNull();
    expect(response.body.order.deliveryDate).toBe('2026-06-20');
    expect(response.body.orderItems).toHaveLength(1);
    expect(response.body.orderItems[0]).toMatchObject({
      orderId: response.body.order._id,
      order: 1,
      quantity: 1,
      lineTotal: 150
    });
    expect(response.body.credit).toBeUndefined();
    expect(response.body.deliveryNote).toBeUndefined();
  });

  it('lists customers with the standard paginated response shape', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerName: 'Acme Co.',
        address: '123 Main St',
        billName: 'Acme Billing'
      });

    expect(created.status).toBe(201);

    const response = await request(app)
      .get('/api/v1/customers?page=1&pageSize=10')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1
    });
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      customerName: 'Acme Co.',
      address: '123 Main St',
      billName: 'Acme Billing'
    });
  });

  it('creates a completed order with credit and delivery note', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const response = await createOrder(app, accessToken, { status: 'completed' });

    expect(response.status).toBe(201);
    expect(response.body.order.completedAt).toEqual(expect.any(String));
    expect(response.body.order.deliveryNote).toMatch(/^DN\d{8}\.pdf$/);
    expect(response.body.orderItems).toHaveLength(1);
    expect(response.body.credit.totalAmount).toBe(150);
    expect(response.body.credit.status).toBe('paid');
    expect(response.body.credit.paidAmount).toBe(150);
    expect(response.body.deliveryNote).toBeUndefined();
  });

  it('creates order items and derives order totals from them', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerId: 99,
        dueDate: '2026-06-30',
        deliveryDate: '2026-06-20',
        status: 'draft',
        items: [
          {
            productId: testProductId,
            productName: 'Widget A',
            unit: 'pcs',
            quantity: 2,
            buyPrice: 100,
            sellPrice: 150
          },
          {
            productId: testProductId,
            productName: 'Widget B',
            unit: 'pcs',
            quantity: 1,
            buyPrice: 50,
            sellPrice: 80
          }
        ]
      });

    expect(response.status).toBe(201);
    expect(response.body.order.customerId).toBe(99);
    expect(response.body.order.dueDate).toBe('2026-06-30');
    expect(response.body.order.deliveryDate).toBe('2026-06-20');
    expect(response.body.credit).toBeUndefined();
    expect(response.body.orderItems).toHaveLength(2);
    expect(response.body.orderItems[0]).toMatchObject({
      order: 1,
      productName: 'Widget A',
      quantity: 2,
      lineTotal: 300
    });
    expect(response.body.orderItems[1]).toMatchObject({
      order: 2,
      productName: 'Widget B',
      quantity: 1,
      lineTotal: 80
    });
  });

  it('gets a specific order with its order items', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerName: 'Acme Co.',
        address: '123 Main St',
        billName: 'Acme Billing'
      });

    const created = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerId: customer.body._id,
        dueDate: '2026-06-30',
        deliveryDate: '2026-06-20',
        status: 'draft',
        items: [
          {
            productId: testProductId,
            productName: 'Widget A',
            unit: 'pcs',
            quantity: 2,
            buyPrice: 100,
            sellPrice: 150
          }
        ]
      });

    const response = await request(app)
      .get(`/api/v1/orders/${created.body.order._id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.order).toMatchObject({
      _id: created.body.order._id
    });
    expect(response.body.orderItems).toHaveLength(1);
    expect(response.body.orderItems[0]).toMatchObject({
      orderId: created.body.order._id,
      productName: 'Widget A',
      quantity: 2,
      lineTotal: 300
    });
  });

  it('patches a draft order and keeps it as a draft', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken);

    const updated = await request(app)
      .patch(`/api/v1/orders/${created.body.order._id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        dueDate: '2026-07-15',
        deliveryDate: '2026-07-10',
        items: [
          {
            productId: testProductId,
            productName: 'Widget B',
            unit: 'box',
            quantity: 2,
            buyPrice: 80,
            sellPrice: 120
          }
        ]
      });

    expect(updated.status).toBe(200);
    expect(updated.body.order.dueDate).toBe('2026-07-15');
    expect(updated.body.order.deliveryDate).toBe('2026-07-10');
    expect(updated.body.order.completedAt).toBeNull();
    expect(updated.body.order.deliveryNote).toBeUndefined();
    expect(updated.body.orderItems).toHaveLength(1);
    expect(updated.body.orderItems[0]).toMatchObject({
      order: 1,
      productName: 'Widget B',
      unit: 'box',
      quantity: 2,
      lineTotal: 240,
      completedAt: null
    });

    const creditCount = await CustomerCreditModel.countDocuments({ orderId: created.body.order._id });
    expect(creditCount).toBe(0);
  });

  it('patches a draft order to completed and creates credit and delivery note', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken);

    const updated = await request(app)
      .patch(`/api/v1/orders/${created.body.order._id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'completed',
        items: [
          {
            productId: testProductId,
            productName: 'Widget C',
            unit: 'pack',
            quantity: 3,
            buyPrice: 90,
            sellPrice: 140
          }
        ]
      });

    expect(updated.status).toBe(200);
    expect(updated.body.order.completedAt).toEqual(expect.any(String));
    expect(updated.body.order.deliveryNote).toMatch(/^DN\d{8}\.pdf$/);
    expect(updated.body.orderItems).toHaveLength(1);
    expect(updated.body.orderItems[0].completedAt).toEqual(expect.any(String));
    expect(updated.body.credit).toMatchObject({
      totalAmount: 420,
      paidAmount: 420,
      status: 'paid'
    });
    expect(updated.body.deliveryNote).toBeUndefined();
  });

  it('rejects patching a completed order', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken, { status: 'completed' });

    const updated = await request(app)
      .patch(`/api/v1/orders/${created.body.order._id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        dueDate: '2026-07-20'
      });

    expect(updated.status).toBe(400);
    expect(updated.body).toEqual({ error: 'ไม่สามารถแก้ไขคำสั่งซื้อที่เสร็จสิ้นแล้วได้' });
  });

  it('creates a delivery note manually for an existing completed order and reuses the same filename on replacement', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken, { status: 'draft' });

    const completed = await request(app)
      .patch(`/api/v1/orders/${created.body.order._id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'completed'
      });

    expect(completed.status).toBe(200);
    const originalFilename = completed.body.order.deliveryNote;
    expect(originalFilename).toMatch(/^DN\d{8}\.pdf$/);

    const removedDeliveryNote = await OrderModel.findOneAndUpdate(
      { _id: created.body.order._id },
      { $unset: { deliveryNote: 1 } },
      { returnDocument: 'after' }
    ).lean();

    expect(removedDeliveryNote?.deliveryNote).toBeUndefined();

    const generated = await request(app)
      .post(`/api/v1/orders/${created.body.order._id}/delivery-note`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send();

    expect(generated.status).toBe(201);
    expect(generated.body.order.deliveryNote).toMatch(/^DN\d{8}\.pdf$/);
    expect(generated.body.orderItems).toHaveLength(1);

    const replaced = await request(app)
      .post(`/api/v1/orders/${created.body.order._id}/delivery-note`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send();

    expect(replaced.status).toBe(201);
    expect(replaced.body.order.deliveryNote).toBe(generated.body.order.deliveryNote);
    expect(replaced.body.order.deliveryNote).not.toBe(originalFilename);
  });

  it('rejects creating a delivery note manually for a draft order', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken);

    const response = await request(app)
      .post(`/api/v1/orders/${created.body.order._id}/delivery-note`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send();

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'สามารถสร้างใบส่งของได้เฉพาะคำสั่งซื้อที่เสร็จสิ้นแล้วเท่านั้น'
    });
  });

  it('creates and updates products with sellPrice, optional defaultBuyPrice, status, and mongo _id', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productName: 'Widget A',
        unit: 'pcs',
        sellPrice: 150
      });

    expect(created.status).toBe(201);
    expect(created.body._id).toEqual(expect.any(String));
    expect(created.body.sellPrice).toBe(150);
    expect(created.body.defaultBuyPrice).toBeUndefined();
    expect(created.body.status).toBe('active');
    expect(created.body.defaultSellPrice).toBeUndefined();

    const updated = await request(app)
      .patch(`/api/v1/products/${created.body._id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        defaultBuyPrice: 100,
        sellPrice: 175,
        status: 'inactive'
      });

    expect(updated.status).toBe(200);
    expect(updated.body._id).toEqual(created.body._id);
    expect(updated.body.defaultBuyPrice).toBe(100);
    expect(updated.body.sellPrice).toBe(175);
    expect(updated.body.status).toBe('inactive');
  });

  it('returns JSON client errors from the fallback handler for uncaught route failures', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const first = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productName: 'Widget A',
        unit: 'pcs',
        sellPrice: 150
      });

    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productName: 'Widget A',
        unit: 'pcs',
        sellPrice: 150
      });

    expect(duplicate.status).toBe(400);
    expect(duplicate.body).toEqual({ error: 'ชื่อสินค้ามีอยู่แล้ว' });
  });

  it('returns JSON when the request body cannot be parsed', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const response = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/json')
      .send('{"productName":"Broken JSON"');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'ข้อมูล JSON ไม่ถูกต้อง' });
  });

  it('returns unauthorized errors from sync auth routes through the fallback handler', async () => {
    const app = createRestApp();

    const response = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'wrong-password'
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  });

  it('returns failed imported products with reasons during product import', async () => {
    await ProductModel.create({
      productName: 'Existing Widget',
      unit: 'pcs',
      sellPrice: 400,
      status: 'active'
    });

    const result = await productService.importProducts([
      ['Widget A', 'pcs', 100, 150, 'active'],
      ['Widget A', 'pcs', 100, 150, 'active'],
      ['Existing Widget', 'pcs', 200, 250, 'active'],
      ['', 'pcs', 100, 150, 'active'],
      ['Widget B', 'pcs', undefined, undefined, 'active']
    ]);

    expect(result.inserted).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      productName: 'Widget A',
      unit: 'pcs',
      defaultBuyPrice: 100,
      sellPrice: 150,
      status: 'active'
    });
    expect(result.failed).toEqual([
      expect.objectContaining({
        row: ['Widget A', 'pcs', 100, 150, 'active'],
        productName: 'Widget A',
        reason: 'Duplicate product name in import file'
      }),
      expect.objectContaining({
        row: ['Existing Widget', 'pcs', 200, 250, 'active'],
        productName: 'Existing Widget',
        reason: 'Product name already exists'
      }),
      expect.objectContaining({
        row: ['', 'pcs', 100, 150, 'active'],
        reason: expect.stringContaining('productName:')
      }),
      expect.objectContaining({
        row: ['Widget B', 'pcs', undefined, undefined, 'active'],
        reason: expect.stringContaining('sellPrice:')
      })
    ]);
  });

  it('normalizes read-excel-file sheet data into product import rows', () => {
    expect(
      extractProductImportRows([
        {
          sheet: 'Sheet1',
          data: [
            ['รายการสินค้า', 'หน่วย', 'ราคาขาย', 'ราคาซื้อ'],
            ['ทดสอบ', 'ชิ้น', 20, 10],
            ['มะนาว', 'ลูก', 100, 50]
          ]
        }
      ])
    ).toEqual([
      ['ทดสอบ', 'ชิ้น', 10, 20, undefined],
      ['มะนาว', 'ลูก', 50, 100, undefined]
    ]);
  });

  it('keeps supporting direct row arrays during product import normalization', () => {
    expect(
      extractProductImportRows([
        ['productName', 'unit', 'sellPrice', 'defaultBuyPrice', 'status'],
        ['Widget A', 'pcs', 150, 100, 'active']
      ])
    ).toEqual([['Widget A', 'pcs', 100, 150, 'active']]);
  });

  it('creates a paid credit when the order starts completed', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const response = await createOrder(app, accessToken, {
      status: 'completed',
      items: [
        {
          productId: testProductId,
          productName: 'Widget A',
          unit: 'pcs',
          quantity: 1,
          buyPrice: 100,
          sellPrice: 225
        }
      ]
    });

    expect(response.status).toBe(201);
    expect(response.body.order.completedAt).toEqual(expect.any(String));
    expect(response.body.credit.totalAmount).toBe(225);
    expect(response.body.credit.paidAmount).toBe(225);
    expect(response.body.credit.status).toBe('paid');
  });

  it('supports partial and full payment in financial transactions', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken, { status: 'completed' });

    const creditId = created.body.credit._id;

    const partial = await request(app)
      .post('/api/v1/finances/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: creditId,
        amount: 50,
        paymentDate: '2026-06-01'
      });

    expect(partial.status).toBe(201);
    const pendingCredit = await CustomerCreditModel.findOne({ _id: creditId }).lean();
    expect(pendingCredit?.status).toBe('pending');
    expect(pendingCredit?.paidAmount).toBe(50);

    const complete = await request(app)
      .post('/api/v1/finances/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: creditId,
        amount: 100,
        paymentDate: '2026-06-02'
      });

    expect(complete.status).toBe(201);
    const [paidCredit, completedOrder] = await Promise.all([
      CustomerCreditModel.findOne({ _id: creditId }).lean(),
      OrderModel.findOne({ _id: created.body.order._id }).lean()
    ]);
    expect(paidCredit?.status).toBe('paid');
    expect(completedOrder?.completedAt).toEqual(expect.any(String));
  });

  it('authenticates REST requests with access and refresh tokens', async () => {
    const app = createRestApp();

    const missingToken = await request(app).get('/api/v1/products');
    expect(missingToken.status).toBe(401);

    const badLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'wrong'
    });
    expect(badLogin.status).toBe(401);

    const tokens = await loginAsAdmin(app);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({
      id: 'admin',
      username: 'admin'
    });

    const refreshed = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: tokens.refreshToken
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeDefined();
    expect(refreshed.body.refreshToken).toBeDefined();
    expect(refreshed.body.expiresIn).toBe(900);
    expect(refreshed.body.refreshExpiresIn).toBe(86400);

    const invalidRefresh = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: tokens.accessToken
    });
    expect(invalidRefresh.status).toBe(401);

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(logout.status).toBe(200);
    expect(logout.body.ok).toBe(true);

    const logoutWithoutToken = await request(app).post('/api/v1/auth/logout');
    expect(logoutWithoutToken.status).toBe(401);
  });

  it('deletes an order with linked customer credit and payments', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken, { status: 'completed' });

    await request(app)
      .post('/api/v1/finances/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: created.body.credit._id,
        amount: 50,
        paymentDate: '2026-06-01'
      });

    const removed = await request(app)
      .delete(`/api/v1/orders/${created.body.order._id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(removed.status).toBe(204);
    const [ordersCount, creditsCount, paymentsCount] = await Promise.all([
      OrderModel.countDocuments(),
      CustomerCreditModel.countDocuments(),
      PaymentTransactionModel.countDocuments()
    ]);
    expect(ordersCount).toBe(0);
    expect(creditsCount).toBe(0);
    expect(paymentsCount).toBe(0);
  });

  it('rejects payments against cancelled customer credit', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await request(app)
      .post('/api/v1/credits/customer-credits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        orderId: new Types.ObjectId().toString(),
        customerId: 99,
        totalAmount: 150,
        paidAmount: 0,
        status: 'cancelled'
      });

    const payment = await request(app)
      .post('/api/v1/finances/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: created.body._id,
        amount: 50,
        paymentDate: '2026-06-01'
      });

    expect(payment.status).toBe(400);
    expect(payment.body.error).toBe('Cannot pay cancelled customer credit');
  });

  it('recomputes credit and order status when replacing or removing a payment', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken, { status: 'completed' });
    const creditId = created.body.credit._id;
    const orderId = created.body.order._id;

    const paid = await request(app)
      .post('/api/v1/finances/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: creditId,
        amount: 150,
        paymentDate: '2026-06-01'
      });

    expect(paid.status).toBe(201);

    const replaced = await request(app)
      .patch(`/api/v1/finances/payments/${paid.body._id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: creditId,
        amount: 50,
        paymentDate: '2026-06-02'
      });

    expect(replaced.status).toBe(200);

    let [credit, order] = await Promise.all([
      CustomerCreditModel.findOne({ _id: creditId }).lean(),
      OrderModel.findOne({ _id: orderId }).lean()
    ]);
    expect(credit?.paidAmount).toBe(50);
    expect(credit?.status).toBe('pending');
    expect(order?.completedAt).toBeNull();
    expect(order?.cancelledAt).toBeNull();

    const removed = await request(app)
      .delete(`/api/v1/finances/payments/${paid.body._id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(removed.status).toBe(204);

    [credit, order] = await Promise.all([
      CustomerCreditModel.findOne({ _id: creditId }).lean(),
      OrderModel.findOne({ _id: orderId }).lean()
    ]);
    expect(credit?.paidAmount).toBe(0);
    expect(credit?.status).toBe('pending');
    expect(order?.completedAt).toBeNull();
    expect(order?.cancelledAt).toBeNull();
  });

  it('updates the linked order when patching a customer credit', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken, { status: 'completed' });
    const creditId = created.body.credit._id;
    const orderId = created.body.order._id;

    const updated = await request(app)
      .patch(`/api/v1/credits/customer-credits/${creditId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        paidAmount: 150
      });

    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('paid');

    const order = await OrderModel.findOne({ _id: orderId }).lean();
    expect(order?.completedAt).toEqual(expect.any(String));
  });

  it('resets the linked order and removes payments when deleting a customer credit', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken, { status: 'completed' });
    const creditId = created.body.credit._id;
    const orderId = created.body.order._id;

    const paid = await request(app)
      .post('/api/v1/finances/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: creditId,
        amount: 150,
        paymentDate: '2026-06-01'
      });

    expect(paid.status).toBe(201);

    const removed = await request(app)
      .delete(`/api/v1/credits/customer-credits/${creditId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(removed.status).toBe(204);

    const [credit, order, paymentsCount] = await Promise.all([
      CustomerCreditModel.findOne({ _id: creditId }).lean(),
      OrderModel.findOne({ _id: orderId }).lean(),
      PaymentTransactionModel.countDocuments({ customerCreditId: creditId })
    ]);
    expect(credit).toBeNull();
    expect(order?.completedAt).toBeNull();
    expect(order?.cancelledAt).toBeNull();
    expect(paymentsCount).toBe(0);
  });

});
