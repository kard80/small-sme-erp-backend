import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initiateDb, disconnectPersistence, CustomerCreditModel, OrderModel, PaymentTransactionModel } from '../src/shared/persistence';
import { createRestApp } from '../src/restApp';

const describeIfMongo = process.env.MONGODB_URI ? describe : describe.skip;

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

const createOrder = async (
  app: ReturnType<typeof createRestApp>,
  accessToken: string,
  overrides: Partial<{
    productId: number;
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
      .post('/api/finance/payments')
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
      .post('/api/finance/payments')
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

    const created = await createOrder(app, accessToken);

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

  it('recomputes credit and order status when replacing or removing a payment', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const created = await createOrder(app, accessToken);
    const creditId = created.body.credit.id;
    const orderId = created.body.order.id;

    const paid = await request(app)
      .post('/api/finance/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: creditId,
        amount: 150,
        paymentDate: '2026-06-01'
      });

    expect(paid.status).toBe(201);

    const replaced = await request(app)
      .patch(`/api/finance/payments/${paid.body.id}`)
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
      .delete(`/api/finance/payments/${paid.body.id}`)
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
      .patch(`/api/credit/customer-credits/${creditId}`)
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
      .post('/api/finance/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerCreditId: creditId,
        amount: 150,
        paymentDate: '2026-06-01'
      });

    expect(paid.status).toBe(201);

    const removed = await request(app)
      .delete(`/api/credit/customer-credits/${creditId}`)
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
