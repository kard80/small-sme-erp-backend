import { Router } from 'express';
import { orderService } from '../order/service';
import { InternalServerError } from '../../shared/errors';
import { parseObjectIdParam } from '../../shared/http';
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
    const id = parseObjectIdParam(req, res, 'เครดิตลูกค้า');
    if (id === undefined) {
      return;
    }

    const credit = await creditService.getCustomerCredit(id);
    if (!credit) {
      return res.status(404).json({ error: 'ไม่พบเครดิตลูกค้า' });
    }

    return res.json(credit);
  });

  router.patch('/customer-credits/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'เครดิตลูกค้า');
    const input = customerCreditUpdateSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' });
    }

    const credit = await runInTransaction(async (session) => {
      const updatedCredit = await creditService.updateCustomerCredit(id, input.data, session);
      if (!updatedCredit) {
        return undefined;
      }

      const order = await orderService.updateOrderStatusFromCredit(updatedCredit.orderId, updatedCredit.status, session);
      if (!order) {
        throw new InternalServerError('ไม่พบคำสั่งซื้อที่เชื่อมโยง');
      }

      return updatedCredit;
    });

    if (!credit) {
      return res.status(404).json({ error: 'ไม่พบเครดิตลูกค้า' });
    }

    return res.json(credit);
  });

  router.delete('/customer-credits/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'เครดิตลูกค้า');
    if (id === undefined) {
      return;
    }

    const removed = await runInTransaction(async (session) => {
      const deletedCredit = await creditService.removeCustomerCredit(id, session);
      if (!deletedCredit) {
        return undefined;
      }

      const order = await orderService.resetOrderStatusAfterCreditRemoval(deletedCredit.orderId, session);
      if (!order) {
        throw new InternalServerError('ไม่พบคำสั่งซื้อที่เชื่อมโยง');
      }

      return deletedCredit;
    });

    if (!removed) {
      return res.status(404).json({ error: 'ไม่พบเครดิตลูกค้า' });
    }

    return res.status(204).send();
  });

  return router;
};
