import express from 'express';
import { assertDbReady } from '../shared/persistence';
import { fallbackErrorHandler } from '../shared/http';
import { isOpenAiConfigured } from '../shared/openai';
import { requireAuth } from '../modules/auth/middleware';
import { createAuthRouter } from '../modules/auth/routes';
import { createProductRouter } from '../modules/product/routes';
import { createCreditRouter } from '../modules/credit/routes';
import { createCustomersRouter } from '../modules/customers/routes';
import { createFinanceRouter } from '../modules/finance/routes';
import { createOrderRouter } from '../modules/order/routes';

export const createRestApp = () => {
  assertDbReady();

  const app = express();
  const apiV1 = express.Router();
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(204).send();
    }

    return next();
  });
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      server: 'rest',
      integrations: {
        openai: {
          configured: isOpenAiConfigured()
        }
      }
    });
  });

  apiV1.use('/auth', createAuthRouter());
  apiV1.use('/products', requireAuth, createProductRouter());
  apiV1.use('/customers', requireAuth, createCustomersRouter());
  apiV1.use('/orders', requireAuth, createOrderRouter());
  apiV1.use('/credits', requireAuth, createCreditRouter());
  apiV1.use('/finances', requireAuth, createFinanceRouter());

  app.use('/api/v1', apiV1);
  app.use(fallbackErrorHandler);

  return app;
};
