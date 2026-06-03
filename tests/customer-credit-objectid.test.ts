import request from 'supertest';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRestApp } from '../src/restApp';
import { CustomerCreditModel, CustomerModel, disconnectPersistence, initiateDb } from '../src/shared/persistence';

const describeIfMongo = process.env.MONGODB_URI ? describe : describe.skip;

const loginAsAdmin = async (app: ReturnType<typeof createRestApp>) => {
  const response = await request(app).post('/api/v1/auth/login').send({
    username: 'admin',
    password: '1234'
  });

  expect(response.status).toBe(200);
  return response.body as {
    accessToken: string;
  };
};

describeIfMongo('customer credit persistence', () => {
  beforeAll(async () => {
    await initiateDb();
  });

  beforeEach(async () => {
    await Promise.all([CustomerCreditModel.deleteMany({}), CustomerModel.deleteMany({})]);
  });

  afterAll(async () => {
    await disconnectPersistence();
  });

  it('stores customerId as an ObjectId in customer_credits', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);

    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerName: 'Mongo Credit Customer',
        address: '456 Side St',
        billName: 'Mongo Credit Billing'
      });

    expect(customer.status).toBe(201);

    const created = await request(app)
      .post('/api/v1/credits/customer-credits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        orderId: new Types.ObjectId().toString(),
        customerId: customer.body._id,
        totalAmount: 150,
        paidAmount: 0,
        status: 'pending'
      });

    expect(created.status).toBe(201);

    const storedCredit = await CustomerCreditModel.findOne({ _id: created.body._id }).lean();
    expect(storedCredit?.customerId).toBeInstanceOf(Types.ObjectId);
    expect(storedCredit?.customerId.toString()).toBe(customer.body._id);
  });
});
