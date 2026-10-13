import { Router } from 'express';
import { parseObjectIdParam } from '../../shared/http';
import { expenseItemSchema } from './schemas';
import { expenseItemService } from './service';

const notFound = 'ไม่พบรายการ';

export const createExpenseItemsRouter = () => {
  const router = Router();

  router.get('/', async (_req, res) => res.json({ data: await expenseItemService.listExpenseItems() }));

  router.post('/', async (req, res) => {
    const input = expenseItemSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.status(201).json(await expenseItemService.createExpenseItem(input.data.itemName));
  });

  router.patch('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'รายการ');
    if (id === undefined) {
      return;
    }
    const input = expenseItemSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    const item = await expenseItemService.updateExpenseItem(id, input.data.itemName);
    return item ? res.json(item) : res.status(404).json({ error: notFound });
  });

  router.delete('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'รายการ');
    if (id === undefined) {
      return;
    }

    if (!(await expenseItemService.removeExpenseItem(id))) {
      return res.status(404).json({ error: notFound });
    }

    return res.status(204).send();
  });

  return router;
};
