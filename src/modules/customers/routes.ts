import { Router } from 'express';
import { parseIdParam } from '../../shared/http';
import { customerSchema, customerUpdateSchema } from './schemas';
import { customersService } from './service';

export const createCustomersRouter = () => {
  const router = Router();

  router.post('/', async (req, res) => {
    const input = customerSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.status(201).json(await customersService.createCustomer(input.data));
  });

  router.get('/', async (_req, res) => {
    return res.json(await customersService.listCustomers());
  });

  router.get('/:id', async (req, res) => {
    const id = parseIdParam(req, res, 'ลูกค้า');
    if (id === undefined) {
      return;
    }

    const customer = await customersService.getCustomer(id);
    if (!customer) {
      return res.status(404).json({ error: 'ไม่พบลูกค้า' });
    }

    return res.json(customer);
  });

  router.patch('/:id', async (req, res) => {
    const id = parseIdParam(req, res, 'ลูกค้า');
    const input = customerUpdateSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' });
    }

    const customer = await customersService.updateCustomer(id, input.data);
    if (!customer) {
      return res.status(404).json({ error: 'ไม่พบลูกค้า' });
    }

    return res.json(customer);
  });

  router.delete('/:id', async (req, res) => {
    const id = parseIdParam(req, res, 'ลูกค้า');
    if (id === undefined) {
      return;
    }

    if (!(await customersService.removeCustomer(id))) {
      return res.status(404).json({ error: 'ไม่พบลูกค้า' });
    }

    return res.status(204).send();
  });

  return router;
};
