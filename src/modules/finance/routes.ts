import { Router } from 'express';
import { parseObjectIdParam } from '../../shared/http';
import { paymentSchema } from './schemas';
import { financeService } from './service';

export const createFinanceRouter = () => {
  const router = Router();

  router.post('/payments', async (req, res) => {
    const input = paymentSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.status(201).json(await financeService.applyPayment(input.data));
  });

  router.get('/payments', async (_req, res) => {
    return res.json(await financeService.listPayments());
  });

  router.get('/payments/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'รายการชำระเงิน');
    if (id === undefined) {
      return;
    }

    const payment = await financeService.getPayment(id);
    if (!payment) {
      return res.status(404).json({ error: 'ไม่พบธุรกรรมการเงิน' });
    }

    return res.json(payment);
  });

  router.patch('/payments/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'รายการชำระเงิน');
    const input = paymentSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' });
    }

    return res.json(await financeService.replacePayment(id, input.data));
  });

  router.delete('/payments/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'รายการชำระเงิน');
    if (id === undefined) {
      return;
    }

    if (!(await financeService.removePayment(id))) {
      return res.status(404).json({ error: 'ไม่พบธุรกรรมการเงิน' });
    }

    return res.status(204).send();
  });

  return router;
};
