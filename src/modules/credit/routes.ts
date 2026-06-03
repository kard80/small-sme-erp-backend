import { Router } from 'express';
import { orderService } from '../order/service';
import { InternalServerError } from '../../shared/errors';
import { paginationSchema, parseObjectIdParam } from '../../shared/http';
import { runInTransaction } from '../../shared/persistence';
import { financeService } from '../finance/service';
import { creditPaymentSchema } from '../finance/schemas';
import { customerCreditSchema, customerCreditUpdateSchema } from './schemas';
import { creditService } from './service';

export const createCreditRouter = () => {
  const router = Router();

  router.post('/', async (req, res) => {
    const input = customerCreditSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.status(201).json(await creditService.createCustomerCredit(input.data));
  });

  router.get('/', async (req, res) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    return res.json(await creditService.listCustomerCredits(parsed.data.page, parsed.data.pageSize));
  });

  router.get('/:id', async (req, res) => {
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

  router.post('/:id/payments', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'เครดิตลูกค้า');
    if (id === undefined) {
      return;
    }

    const input = creditPaymentSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    const payment = await financeService.applyPayment({ customerCreditId: id, ...input.data });
    return res.status(201).json(payment);
  });

  router.patch('/:id', async (req, res) => {
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

      const order = await orderService.updateOrderStatusFromCredit(
        updatedCredit.orderId.toString(),
        updatedCredit.status,
        session
      );
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

  router.delete('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'เครดิตลูกค้า');
    if (id === undefined) {
      return;
    }

    const removed = await runInTransaction(async (session) => {
      const deletedCredit = await creditService.removeCustomerCredit(id, session);
      if (!deletedCredit) {
        return undefined;
      }

      const order = await orderService.resetOrderStatusAfterCreditRemoval(deletedCredit.orderId.toString(), session);
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
