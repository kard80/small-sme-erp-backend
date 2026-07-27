import { Router } from 'express';
import { Types } from 'mongoose';
import { parseObjectIdParam, paginationSchema, sendZodError } from '../../shared/http';
import { orderInputSchema, orderUpdateSchema } from './schemas';
import { orderService } from './service';
import { Pagination } from '../../shared/pagination';
import { ComparableFilter } from '../../shared/filters';
import moment from '../../shared/moment';

export const createOrderRouter = () => {
  const router = Router();

  router.post('/', async (req, res) => {
    const input = orderInputSchema.safeParse(req.body);
    if (!input.success) {
      return sendZodError(res, input.error);
    }

    return res.status(201).json(await orderService.createOrder(input.data));
  });

  router.get('/', async (req, res) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return sendZodError(res, parsed.error);
    }

    const { page, pageSize, deliveryDateStart, deliveryDateEnd, status } = parsed.data;
    const pagination = new Pagination(page, pageSize);
    let where: Record<string, ComparableFilter<unknown>> = {};
    if (deliveryDateStart && deliveryDateEnd) {
      where = {
        deliveryDate: new ComparableFilter({
          $gte: moment(deliveryDateStart, 'YYYY-MM-DD').startOf('day').toDate(),
          $lte: moment(deliveryDateEnd, 'YYYY-MM-DD').endOf('day').toDate()
        })
      };
    }
    if (status === 'completed') {
      where = { ...where, completedAt: new ComparableFilter({ $ne: null }) };
    }
    return res.json(
      await orderService.listOrders({
        pagination,
        where
      })
    );
  });

  router.get('/summary', async (req, res) => {
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    return res.json(await orderService.getSummary(startDate, endDate));
  });

  router.get('/:orderId/delivery-note', async (req, res) => {
    const orderId = req.params.orderId;
    if (typeof orderId !== 'string' || !Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: 'รหัสคำสั่งซื้อไม่ถูกต้อง' });
    }

    return res.json(await orderService.getDeliveryNoteDownloadUrl(orderId));
  });

  router.post('/:orderId/delivery-note', async (req, res) => {
    const orderId = req.params.orderId;
    if (typeof orderId !== 'string' || !Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: 'รหัสคำสั่งซื้อไม่ถูกต้อง' });
    }

    const order = await orderService.createDeliveryNote(orderId);
    if (!order) {
      return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
    }

    return res.status(201).json(order);
  });

  router.get('/:orderId', async (req, res) => {
    const orderId = req.params.orderId;
    if (typeof orderId !== 'string' || !Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: 'รหัสคำสั่งซื้อไม่ถูกต้อง' });
    }

    const order = await orderService.getOrderWithItems(orderId);
    if (!order) {
      return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
    }

    return res.json(order);
  });

  router.patch('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'คำสั่งซื้อ');
    const input = orderUpdateSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return sendZodError(res, input.error);
    }

    const order = await orderService.updateOrder(id, input.data);
    if (!order) {
      return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
    }

    return res.json(order);
  });

  router.delete('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'คำสั่งซื้อ');
    if (id === undefined) {
      return;
    }

    const removed = await orderService.removeOrder(id);
    if (!removed) {
      return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
    }

    return res.status(204).send();
  });

  return router;
};
