import { Router } from 'express';
import {
  createReceiptNoteDto,
  getReceiptNotesDto,
  getEligibleBillingNotesDto,
  receiptNoteIdDto
} from './dto';
import z from 'zod';
import { receiptNoteService } from './services/service';

export const createReceiptNoteRouter = () => {
  const router = Router();

  router.get('/', async (req, res) => {
    const { date, customerId } = req.query;
    const { success, error, data } = getReceiptNotesDto.safeParse({ date, customerId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const receiptNotes = await receiptNoteService.getReceiptNotes(data.date, data.customerId);

    res.status(200).json({
      ...receiptNotes,
      data: receiptNotes.data.map((item) => ({
        _id: item._id,
        customerId: item.customerId,
        customerName: item.customerName,
        receiptDate: item.receiptDate,
        totalAmount: item.totalAmount,
        documentNumber: item.documentNumber
      }))
    });
  });

  router.get('/eligible-billing-notes', async (req, res) => {
    const { startDate, endDate, customerId } = req.query;
    const { success, error, data } = getEligibleBillingNotesDto.safeParse({ startDate, endDate, customerId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const eligibleBillingNotes = await receiptNoteService.getEligibleBillingNotes(
      data.startDate,
      data.endDate,
      data.customerId
    );

    res.status(200).json({
      ...eligibleBillingNotes,
      data: eligibleBillingNotes.data.map((item) => ({
        _id: item._id,
        totalAmount: item.totalAmount,
        issuedDate: item.issuedDate,
        documentNumber: item.documentNumber
      }))
    });
  });

  router.post('/', async (req, res) => {
    const { success, error, data } = createReceiptNoteDto.safeParse(req.body);
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const response = await receiptNoteService.createReceiptNote(
      data.billingNoteIds,
      data.receiptDate,
      data.customerId
    );

    res.status(201).json(response);
  });

  router.get('/:receiptNoteId', async (req, res) => {
    const { receiptNoteId } = req.params;
    const { success, error, data } = receiptNoteIdDto.safeParse({ receiptNoteId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const receiptNote = await receiptNoteService.getReceiptNoteDetail(data.receiptNoteId);

    res.status(200).json({
      _id: receiptNote._id,
      customerId: receiptNote.customerId,
      customerName: receiptNote.customerName,
      receiptDate: receiptNote.receiptDate,
      totalAmount: receiptNote.totalAmount,
      documentNumber: receiptNote.documentNumber,
      billingNotes: receiptNote.billingNotes.map((billingNote) => ({
        _id: billingNote._id,
        documentNumber: billingNote.documentNumber,
        issuedDate: billingNote.issuedDate,
        totalAmount: billingNote.totalAmount
      }))
    });
  });

  router.get('/:receiptNoteId/document', async (req, res) => {
    const { receiptNoteId } = req.params;
    const { success, error, data } = receiptNoteIdDto.safeParse({ receiptNoteId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const response = await receiptNoteService.getReceiptNoteDocumentDownloadUrl(data.receiptNoteId);
    res.status(200).json(response);
  });

  router.post('/:receiptNoteId/regenerate-document', async (req, res) => {
    const { receiptNoteId } = req.params;
    const { success, error, data } = receiptNoteIdDto.safeParse({ receiptNoteId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    const response = await receiptNoteService.manualInsertReceiptNote(data.receiptNoteId);
    res.status(201).json(response);
  });

  router.delete('/:receiptNoteId', async (req, res) => {
    const { receiptNoteId } = req.params;
    const { success, error, data } = receiptNoteIdDto.safeParse({ receiptNoteId });
    if (!success) {
      return res.status(400).json({ error: z.flattenError(error) });
    }

    await receiptNoteService.deleteReceiptNote(data.receiptNoteId);
    res.status(204).send();
  });

  return router;
};
