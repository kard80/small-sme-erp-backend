import { Router } from 'express';
import { salesService } from '../sales/service';
import { parseIdParam } from '../../shared/http';
import { customerCreditSchema, customerCreditUpdateSchema } from './schemas';
import { creditService, mapOrderStatusFromCredit } from './service';

export const createCreditRouter = () => {
  const router = Router();

  router.post('/customer-credits', async (req, res) => {
    const input = customerCreditSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.status(201).json(await creditService.createCustomerCredit(input.data));
  });

  router.get('/customer-credits', async (_req, res) => {
    return res.json(await creditService.listCustomerCredits());
  });

  router.get('/customer-credits/:id', async (req, res) => {
    const id = parseIdParam(req, res, 'customer credit');
    if (id === undefined) {
      return;
    }

    const credit = await creditService.getCustomerCredit(id);
    if (!credit) {
      return res.status(404).json({ error: 'Customer credit not found' });
    }

    return res.json(credit);
  });

  router.patch('/customer-credits/:id', async (req, res) => {
    const id = parseIdParam(req, res, 'customer credit');
    const input = customerCreditUpdateSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const credit = await creditService.updateCustomerCredit(id, input.data);
    if (!credit) {
      return res.status(404).json({ error: 'Customer credit not found' });
    }

    await salesService.setOrderStatus(credit.orderId, mapOrderStatusFromCredit(credit.status));
    return res.json(credit);
  });

  router.delete('/customer-credits/:id', async (req, res) => {
    const id = parseIdParam(req, res, 'customer credit');
    if (id === undefined) {
      return;
    }

    const removed = await creditService.removeCustomerCredit(id);
    if (!removed) {
      return res.status(404).json({ error: 'Customer credit not found' });
    }

    return res.status(204).send();
  });

  return router;
};
