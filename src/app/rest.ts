import cors from 'cors';
import express from 'express';
import pinoHttp from 'pino-http';
import { assertDbReady } from '../shared/persistence';
import { fallbackErrorHandler } from '../shared/http';
import { logger } from '../shared/logger';
import { requireAuth } from '../modules/auth/middleware';
import { createAuthRouter } from '../modules/auth/routes';
import { createProductRouter } from '../modules/product/routes';
import { createCustomersRouter } from '../modules/customers/routes';
import { createExpenseItemsRouter } from '../modules/expense-item/routes';
import { createExpensesRouter } from '../modules/expense/routes';
import { createSuppliersRouter } from '../modules/supplier/routes';
import { createOrderRouter } from '../modules/order/routes';
import { createBillingNoteRouter } from '../modules/billing-note/routes';
import { createReceiptNoteRouter } from '../modules/receipt-note/routes';
import { createPhotoImportsRouter } from '../modules/photo-imports/routes';

export const createRestApp = () => {
  assertDbReady();

  const app = express();
  const apiV1 = express.Router();

  // Production (Dockerfile sets NODE_ENV=production) only trusts CORS_ORIGIN; local dev allows any origin.
  app.use(cors(process.env.NODE_ENV === 'production'
    ? {
      origin: 'https://small-sme-erp-web-433818871135.asia-southeast1.run.app',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    }
    : { origin: true, credentials: true }));

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      server: 'rest'
    });
  });

  apiV1.use('/auth', createAuthRouter());
  apiV1.use('/expenses', requireAuth, createExpensesRouter());
  apiV1.use('/expense-items', requireAuth, createExpenseItemsRouter());
  apiV1.use('/suppliers', requireAuth, createSuppliersRouter());
  apiV1.use('/products', requireAuth, createProductRouter());
  apiV1.use('/customers', requireAuth, createCustomersRouter());
  apiV1.use('/billing-notes', requireAuth, createBillingNoteRouter());
  apiV1.use('/receipt-notes', requireAuth, createReceiptNoteRouter());
  apiV1.use('/orders', requireAuth, createOrderRouter());
  apiV1.use('/photo-imports', requireAuth, createPhotoImportsRouter());

  app.use('/api/v1', apiV1);
  app.use(fallbackErrorHandler);

  return app;
};
