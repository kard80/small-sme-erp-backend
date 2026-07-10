import { Router } from 'express';
import { createBillingNoteDto, getBillingDto, manualInsertBillingNoteDto } from './dto';
import z from 'zod';
import { billingService } from './services/service';

export const createBillingRouter = () => {
  const router = Router();

  router.get('/', async (req, res) => {
    const { date, customerId } = req.query;
    const { success, error, data } = getBillingDto.safeParse({ date, customerId });
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

  router.post('/', async (req, res) => {
    const { success, error, data } = createBillingNoteDto.safeParse(req.body);
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const response = await billingService.createBillingNote(data.orderIds, data.issuedDate, data.customerId);

    res.status(201).json(response);
  });

  router.post('/billing-notes/:billingNoteId', async (req, res) => {
    const { billingNoteId } = req.params;
    const { success, error, data } = manualInsertBillingNoteDto.safeParse({ billingNoteId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const response = await billingService.manualInsertBillingNote(data.billingNoteId);
    res.status(201).json(response);
  });

  return router;
};
