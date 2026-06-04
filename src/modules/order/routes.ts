import { Router } from 'express';
import { Types } from 'mongoose';
import { parseObjectIdParam, paginationSchema, sendZodError } from '../../shared/http';
import { orderImageOcrInputSchema, orderInputSchema, orderOcrUploadBatchInputSchema, orderUpdateSchema } from './schemas';
import { orderService } from './service';

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

    return res.json(await orderService.listOrders(parsed.data.page, parsed.data.pageSize));
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

  router.post('/ocr', async (req, res) => {
    const input = orderImageOcrInputSchema.safeParse(req.body);
    if (!input.success) {
      return sendZodError(res, input.error);
    }

    return res.json(await orderService.parseOrderImageUrls(input.data.imageUrls));
  });

  router.post('/ocr/upload', async (req, res) => {
    const input = orderOcrUploadBatchInputSchema.safeParse(req.body);
    if (!input.success) {
      return sendZodError(res, input.error);
    }

    return res.status(201).json(await orderService.createOcrUploadBatch(input.data.filenames));
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
