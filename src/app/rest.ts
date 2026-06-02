import express from 'express';
import { assertDbReady } from '../shared/persistence';
import { requireAuth } from '../modules/auth/middleware';
import { createAuthRouter } from '../modules/auth/routes';
import { createCatalogRouter } from '../modules/catalog/routes';
import { createCreditRouter } from '../modules/credit/routes';
import { createCustomersRouter } from '../modules/customers/routes';
import { createFinanceRouter } from '../modules/finance/routes';
import { createSalesRouter } from '../modules/sales/routes';

export const createRestApp = () => {
  assertDbReady();

  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, server: 'rest' });
  });

  app.use('/api/auth', createAuthRouter());
  app.use('/api/catalog', requireAuth, createCatalogRouter());
  app.use('/api/customers', requireAuth, createCustomersRouter());
  app.use('/api/sales', requireAuth, createSalesRouter());
  app.use('/api/credit', requireAuth, createCreditRouter());
  app.use('/api/finance', requireAuth, createFinanceRouter());

  return app;
};
