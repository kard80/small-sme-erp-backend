import express from 'express';
import { assertDbReady } from '../shared/persistence';
import { requireAuth } from '../modules/auth/middleware';
import { createAuthRouter } from '../modules/auth/routes';
import { createProductRouter } from '../modules/product/routes';
import { createCreditRouter } from '../modules/credit/routes';
import { createCustomersRouter } from '../modules/customers/routes';
import { createFinanceRouter } from '../modules/finance/routes';
import { createOrderRouter } from '../modules/sales/routes';

export const createRestApp = () => {
  assertDbReady();

  const app = express();
  const apiV1 = express.Router();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, server: 'rest' });
  });

  apiV1.use('/auth', createAuthRouter());
  apiV1.use('/products', requireAuth, createProductRouter());
  apiV1.use('/customers', requireAuth, createCustomersRouter());
  apiV1.use('/orders', requireAuth, createOrderRouter());
  apiV1.use('/credits', requireAuth, createCreditRouter());
  apiV1.use('/finances', requireAuth, createFinanceRouter());

  app.use('/api/v1', apiV1);

  return app;
};
