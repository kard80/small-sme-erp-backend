import { Router } from 'express';
import { paginationSchema, parseObjectIdParam } from '../../shared/http';
import { expenseSchema, expenseSummaryQuerySchema, expenseUpdateSchema } from './schemas';
import { expenseService } from './service';

const notFound = 'ไม่พบรายจ่าย';

export const createExpensesRouter = () => {
  const router = Router();

  router.post('/', async (req, res) => {
    const input = expenseSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.status(201).json(await expenseService.createExpense(input.data));
  });

  router.get('/', async (req, res) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    return res.json(await expenseService.listExpenses(parsed.data.page, parsed.data.pageSize));
  });

  // Declared before /:id so 'summary' is not parsed as an id.
  router.get('/summary', async (req, res) => {
    const parsed = expenseSummaryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    return res.json(await expenseService.getSummary(parsed.data.startDate, parsed.data.endDate));
  });

  router.get('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'รายจ่าย');
    if (id === undefined) {
      return;
    }

    const expense = await expenseService.getExpense(id);
    return expense ? res.json(expense) : res.status(404).json({ error: notFound });
  });

  router.patch('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'รายจ่าย');
    if (id === undefined) {
      return;
    }
    const input = expenseUpdateSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    const expense = await expenseService.updateExpense(id, input.data);
    return expense ? res.json(expense) : res.status(404).json({ error: notFound });
  });

  router.delete('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'รายจ่าย');
    if (id === undefined) {
      return;
    }

    if (!(await expenseService.removeExpense(id))) {
      return res.status(404).json({ error: notFound });
    }

    return res.status(204).send();
  });

  return router;
};
