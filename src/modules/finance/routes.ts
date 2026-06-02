import { Router } from 'express';
import { errorMessage, parseIdParam } from '../../shared/http';
import { paymentSchema } from './schemas';
import { financeService } from './service';

export const createFinanceRouter = () => {
  const router = Router();

  router.post('/payments', async (req, res) => {
    const input = paymentSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    try {
      return res.status(201).json(await financeService.applyPayment(input.data));
    } catch (error) {
      return res.status(400).json({ error: errorMessage(error) });
    }
  });

  router.get('/payments', async (_req, res) => {
    return res.json(await financeService.listPayments());
  });

  router.get('/payments/:id', async (req, res) => {
    const id = parseIdParam(req, res, 'payment');
    if (id === undefined) {
      return;
    }

    const payment = await financeService.getPayment(id);
    if (!payment) {
      return res.status(404).json({ error: 'Financial transaction not found' });
    }

    return res.json(payment);
  });

  router.patch('/payments/:id', async (req, res) => {
    const id = parseIdParam(req, res, 'payment');
    const input = paymentSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    try {
      return res.json(await financeService.replacePayment(id, input.data));
    } catch (error) {
      return res.status(400).json({ error: errorMessage(error) });
    }
  });

  router.delete('/payments/:id', async (req, res) => {
    const id = parseIdParam(req, res, 'payment');
    if (id === undefined) {
      return;
    }

    if (!(await financeService.removePayment(id))) {
      return res.status(404).json({ error: 'Financial transaction not found' });
    }

    return res.status(204).send();
  });

  return router;
};
