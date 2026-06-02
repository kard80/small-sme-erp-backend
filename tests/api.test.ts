import request from 'supertest';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { extractProductImportRows } from '../src/modules/product/routes';
import {
  initiateDb,
  disconnectPersistence,
  CustomerCreditModel,
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
    productId: string;
    productName: string;
    unit: string;
    buyPrice: number;
    sellPrice: number;
    customerId: number;
    dueDate: string;
    status: 'pending' | 'completed' | 'cancelled';
  }> = {}
) => {
  return request(app)
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      productId: testProductId,
      productName: 'Widget A',
      unit: 'pcs',
      buyPrice: 100,
      sellPrice: 150,
      customerId: 99,
      dueDate: '2026-06-30',
      status: 'pending',
      ...overrides
    });
};

describeIfMongo('ERP backend', () => {
  beforeAll(async () => {
    await initiateDb();
  });

  beforeEach(async () => {
    await Promise.all([
      ProductModel.deleteMany({}),
      PaymentTransactionModel.deleteMany({}),
      CustomerCreditModel.deleteMany({}),
      OrderModel.deleteMany({})
    ]);
  });

  afterAll(async () => {
    await disconnectPersistence();
  });

  it('creates order via REST and auto-creates customer credit', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const response = await createOrder(app, accessToken);

    expect(response.status).toBe(201);
    expect(response.body.order.id).toBeDefined();
    expect(response.body.credit.totalAmount).toBe(150);
    expect(response.body.credit.status).toBe('pending');
    expect(response.body.credit.paidAmount).toBe(0);
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

    const response = await createOrder(app, accessToken, { status: 'completed', sellPrice: 225 });

    expect(response.status).toBe(201);
    expect(response.body.order.status).toBe('completed');
    expect(response.body.credit.totalAmount).toBe(225);
    expect(response.body.credit.paidAmount).toBe(225);
    expect(response.body.credit.status).toBe('paid');
  });

  it('supports partial and full payment in financial transactions', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken);

    const creditId = created.body.credit.id;

    const partial = await request(app)
      .post('/api/v1/finances/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: creditId,
        amount: 50,
        paymentDate: '2026-06-01'
      });

    expect(partial.status).toBe(201);
    const pendingCredit = await CustomerCreditModel.findOne({ id: creditId }).lean();
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
      CustomerCreditModel.findOne({ id: creditId }).lean(),
      OrderModel.findOne({ id: created.body.order.id }).lean()
    ]);
    expect(paidCredit?.status).toBe('paid');
    expect(completedOrder?.status).toBe('completed');
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

    const created = await createOrder(app, accessToken);

    await request(app)
      .post('/api/v1/finances/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: created.body.credit.id,
        amount: 50,
        paymentDate: '2026-06-01'
      });

    const removed = await request(app)
      .delete(`/api/v1/orders/${created.body.order.id}`)
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
        orderId: 1,
        customerId: 99,
        totalAmount: 150,
        paidAmount: 0,
        status: 'cancelled'
      });

    const payment = await request(app)
      .post('/api/v1/finances/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: created.body.id,
        amount: 50,
        paymentDate: '2026-06-01'
      });

    expect(payment.status).toBe(400);
    expect(payment.body.error).toBe('Cannot pay cancelled customer credit');
  });

  it('recomputes credit and order status when replacing or removing a payment', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken);
    const creditId = created.body.credit.id;
    const orderId = created.body.order.id;

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
      .patch(`/api/v1/finances/payments/${paid.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: creditId,
        amount: 50,
        paymentDate: '2026-06-02'
      });

    expect(replaced.status).toBe(200);

    let [credit, order] = await Promise.all([
      CustomerCreditModel.findOne({ id: creditId }).lean(),
      OrderModel.findOne({ id: orderId }).lean()
    ]);
    expect(credit?.paidAmount).toBe(50);
    expect(credit?.status).toBe('pending');
    expect(order?.status).toBe('pending');

    const removed = await request(app)
      .delete(`/api/v1/finances/payments/${paid.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(removed.status).toBe(204);

    [credit, order] = await Promise.all([
      CustomerCreditModel.findOne({ id: creditId }).lean(),
      OrderModel.findOne({ id: orderId }).lean()
    ]);
    expect(credit?.paidAmount).toBe(0);
    expect(credit?.status).toBe('pending');
    expect(order?.status).toBe('pending');
  });

  it('updates the linked order when patching a customer credit', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken);
    const creditId = created.body.credit.id;
    const orderId = created.body.order.id;

    const updated = await request(app)
      .patch(`/api/v1/credits/customer-credits/${creditId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        paidAmount: 150
      });

    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('paid');

    const order = await OrderModel.findOne({ id: orderId }).lean();
    expect(order?.status).toBe('completed');
  });

  it('resets the linked order and removes payments when deleting a customer credit', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken);
    const creditId = created.body.credit.id;
    const orderId = created.body.order.id;

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
      CustomerCreditModel.findOne({ id: creditId }).lean(),
      OrderModel.findOne({ id: orderId }).lean(),
      PaymentTransactionModel.countDocuments({ customerCreditId: creditId })
    ]);
    expect(credit).toBeNull();
    expect(order?.status).toBe('pending');
    expect(paymentsCount).toBe(0);
  });

});
