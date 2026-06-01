import { Router } from 'express';
import { financeService } from '../finance/service';
import { parseIdParam, paginationSchema } from '../../shared/http';
import { orderInputSchema, orderUpdateSchema } from './schemas';
import { salesService } from './service';

export const createSalesRouter = () => {
  const router = Router();

  router.post('/orders', (req, res) => {
    const input = orderInputSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.status(201).json(salesService.createOrder(input.data));
  });

  router.get('/orders', (req, res) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    return res.json(salesService.listOrders(parsed.data.page, parsed.data.pageSize));
  });

  router.patch('/orders/:id', (req, res) => {
    const id = parseIdParam(req, res, 'order');
    const input = orderUpdateSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const order = salesService.updateOrder(id, input.data);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json(order);
  });

  router.delete('/orders/:id', (req, res) => {
    const id = parseIdParam(req, res, 'order');
    if (id === undefined) {
      return;
    }

    const removed = salesService.removeOrder(id);
    if (!removed) {
      return res.status(404).json({ error: 'Order not found' });
    }

    for (const credit of removed.credits) {
      financeService.removePaymentsForCredit(credit.id);
    }

    return res.status(204).send();
  });

  return router;
};
