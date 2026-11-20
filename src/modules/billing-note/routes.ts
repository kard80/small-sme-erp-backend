import { Router } from 'express';
import { createBillingNoteDto, customDocumentDto, getBillingNotesDto, getEligibleOrdersDto, manualInsertBillingNoteDto, updateBillingNoteDto } from './dto';
import z from 'zod';
import { billingNoteService } from './services/service';

export const createBillingNoteRouter = () => {
  const router = Router();

  router.get('/', async (req, res) => {
    const { date, customerId } = req.query;
    const { success, error, data } = getBillingNotesDto.safeParse({ date, customerId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const billingNotes = await billingNoteService.getBillingNotes(data.date, data.customerId);

    res.status(200).json({
      ...billingNotes,
      data: billingNotes.data.map((item) => ({
        _id: item._id,
        customerId: item.customerId,
        customerName: item.customerName,
        issuedDate: item.issuedDate,
        totalAmount: item.totalAmount,
        documentNumber: item.documentNumber
      }))
    });
  });

  router.get('/eligible-orders', async (req, res) => {
    const { startDate, endDate, customerId } = req.query;
    const { success, error, data } = getEligibleOrdersDto.safeParse({ startDate, endDate, customerId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const eligibleOrders = await billingNoteService.getEligibleOrders(data.startDate, data.endDate, data.customerId);

    res.status(200).json({
      ...eligibleOrders,
      data: eligibleOrders.data.map((item) => ({
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

    const response = await billingNoteService.createBillingNote(data.orderIds, data.issuedDate, data.customerId);

    res.status(201).json(response);
  });

  router.post('/custom-document', async (req, res) => {
    const { success, error, data } = customDocumentDto.safeParse(req.body);
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const pdf = await billingNoteService.renderCustomDocument(data);
    res.status(200).type('application/pdf').send(Buffer.from(pdf));
  });

  router.get('/:billingNoteId', async (req, res) => {
    const { success, error, data } = manualInsertBillingNoteDto.safeParse({ billingNoteId: req.params.billingNoteId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const billingNote = await billingNoteService.getBillingNote(data.billingNoteId);
    res.status(200).json({
      _id: billingNote._id,
      customerId: billingNote.customerId,
      customerName: billingNote.customerName,
      issuedDate: billingNote.issuedDate,
      totalAmount: billingNote.totalAmount,
      documentNumber: billingNote.documentNumber,
      orders: billingNote.orders.map((order) => ({
        _id: order._id,
        totalAmount: order.totalAmount,
        deliveryDate: order.deliveryDate,
        deliveryNote: order.deliveryNote
      }))
    });
  });

  router.put('/:billingNoteId', async (req, res) => {
    const id = manualInsertBillingNoteDto.safeParse({ billingNoteId: req.params.billingNoteId });
    if (!id.success) {
      return res.status(400).json({ error: z.flattenError(id.error) });
    }
    const body = updateBillingNoteDto.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: z.flattenError(body.error) });
    }

    const response = await billingNoteService.updateBillingNote(
      id.data.billingNoteId,
      body.data.orderIds,
      body.data.issuedDate
    );
    res.status(200).json(response);
  });

  router.get('/:billingNoteId/document', async (req, res) => {
    const { billingNoteId } = req.params;
    const { success, error, data } = manualInsertBillingNoteDto.safeParse({ billingNoteId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const response = await billingNoteService.getBillingNoteDocumentDownloadUrl(data.billingNoteId);
    res.status(200).json(response);
  });

  router.post('/:billingNoteId/regenerate-document', async (req, res) => {
    const { billingNoteId } = req.params;
    const { success, error, data } = manualInsertBillingNoteDto.safeParse({ billingNoteId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const response = await billingNoteService.manualInsertBillingNote(data.billingNoteId);
    res.status(201).json(response);
  });

  router.delete('/:billingNoteId', async (req, res) => {
    const { billingNoteId } = req.params;
    const { success, error, data } = manualInsertBillingNoteDto.safeParse({ billingNoteId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    await billingNoteService.deleteBillingNote(data.billingNoteId);
    res.status(204).send();
  });

  return router;
};
