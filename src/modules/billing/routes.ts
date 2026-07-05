import { Router } from 'express';
import { getBillingSchema } from './schema';
import z from 'zod';
import { billingService } from './service';

export const createBillingRouter = () => {
  const router = Router();

  router.get('/', async (req, res) => {
    const { date, customerId } = req.query;
    const { success, error, data } = getBillingSchema.safeParse({ date, customerId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const billing = await billingService.getBilling(data.date, data.customerId);

    res.status(200).json({
      ...billing,
      data: billing.data.map((item) => ({
        _id: item._id,
        totalAmount: item.totalAmount,
        deliveryDate: item.deliveryDate,
        deliveryNote: item.deliveryNote
      }))
    });
  });

  router.post('/documents', async (req, res) => {
    const { date, customerId } = req.body;
    const { success, error, data } = getBillingSchema.safeParse({ date, customerId });

    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const document = await billingService.generateBillingDocument(data.date, data.customerId);

    res.setHeader('Content-Type', document.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
    res.status(200).send(document.bytes);
  });

  return router;
};
