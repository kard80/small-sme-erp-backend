import { Router } from 'express';
import { financeService } from '../finance/service';
import { salesService } from '../sales/service';
import { parseIdParam } from '../../shared/http';
import { customerCreditSchema, customerCreditUpdateSchema } from './schemas';
import { creditService, mapOrderStatusFromCredit } from './service';

export const createCreditRouter = () => {
  const router = Router();

  router.post('/customer-credits', (req, res) => {
    const input = customerCreditSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.status(201).json(creditService.createCustomerCredit(input.data));
  });

  router.get('/customer-credits', (_req, res) => {
    return res.json(creditService.listCustomerCredits());
  });

  router.get('/customer-credits/:id', (req, res) => {
    const id = parseIdParam(req, res, 'customer credit');
    if (id === undefined) {
      return;
    }

    const credit = creditService.getCustomerCredit(id);
    if (!credit) {
      return res.status(404).json({ error: 'Customer credit not found' });
    }

    return res.json(credit);
  });

  router.patch('/customer-credits/:id', (req, res) => {
    const id = parseIdParam(req, res, 'customer credit');
    const input = customerCreditUpdateSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const credit = creditService.updateCustomerCredit(id, input.data);
    if (!credit) {
      return res.status(404).json({ error: 'Customer credit not found' });
    }

    salesService.setOrderStatus(credit.orderId, mapOrderStatusFromCredit(credit.status));
    return res.json(credit);
  });

  router.delete('/customer-credits/:id', (req, res) => {
    const id = parseIdParam(req, res, 'customer credit');
    if (id === undefined) {
      return;
    }

    const removed = creditService.removeCustomerCredit(id);
    if (!removed) {
      return res.status(404).json({ error: 'Customer credit not found' });
    }

    financeService.removePaymentsForCredit(removed.id);
    return res.status(204).send();
  });

  return router;
};
