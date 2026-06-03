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

  it('stores object ids and snapshots in customer_credits', async () => {
    const app = createRestApp();
    const { accessToken } = await loginAsAdmin(app);
    const orderId = new Types.ObjectId().toString();

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
        orderId,
        customerId: customer.body._id,
        customerBillName: 'Mongo Credit Billing',
        dueDate: '2026-06-30',
        deliveryNote: 'DN20260630',
        totalAmount: 150,
        paidAmount: 0,
        status: 'pending'
      });

    expect(created.status).toBe(201);

    const storedCredit = await CustomerCreditModel.findOne({ _id: created.body._id }).lean();
    expect(storedCredit?.orderId).toBeInstanceOf(Types.ObjectId);
    expect(storedCredit?.orderId.toString()).toBe(orderId);
    expect(storedCredit?.customerId).toBeInstanceOf(Types.ObjectId);
    expect(storedCredit?.customerId.toString()).toBe(customer.body._id);
    expect(storedCredit?.customerBillName).toBe('Mongo Credit Billing');
    expect(storedCredit?.deliveryNote).toBe('DN20260630');
    expect(storedCredit?.dueDate).toEqual(new Date('2026-06-30T00:00:00.000+07:00'));
  });
});
