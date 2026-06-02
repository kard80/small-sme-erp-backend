import { Router } from 'express';
import { salesService } from '../sales/service';
import { errorMessage, parseIdParam } from '../../shared/http';
import { runInTransaction } from '../../shared/persistence';
import { customerCreditSchema, customerCreditUpdateSchema } from './schemas';
import { creditService } from './service';

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

    try {
      const credit = await runInTransaction(async (session) => {
        const updatedCredit = await creditService.updateCustomerCredit(id, input.data, session);
        if (!updatedCredit) {
          return undefined;
        }

        const order = await salesService.updateOrderStatusFromCredit(updatedCredit.orderId, updatedCredit.status, session);
        if (!order) {
          throw new Error('Linked order not found');
        }

        return updatedCredit;
      });

      if (!credit) {
        return res.status(404).json({ error: 'Customer credit not found' });
      }

      return res.json(credit);
    } catch (error) {
      return res.status(400).json({ error: errorMessage(error) });
    }
  });

  router.delete('/customer-credits/:id', async (req, res) => {
    const id = parseIdParam(req, res, 'customer credit');
    if (id === undefined) {
      return;
    }

    try {
      const removed = await runInTransaction(async (session) => {
        const deletedCredit = await creditService.removeCustomerCredit(id, session);
        if (!deletedCredit) {
          return undefined;
        }

        const order = await salesService.resetOrderStatusAfterCreditRemoval(deletedCredit.orderId, session);
        if (!order) {
          throw new Error('Linked order not found');
        }

        return deletedCredit;
      });

      if (!removed) {
        return res.status(404).json({ error: 'Customer credit not found' });
      }

      return res.status(204).send();
    } catch (error) {
      return res.status(400).json({ error: errorMessage(error) });
    }
  });

  return router;
};
