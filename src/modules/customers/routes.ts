import { Router } from 'express';
import { parseIdParam } from '../../shared/http';
import { customerSchema, customerUpdateSchema } from './schemas';
import { customersService } from './service';

export const createCustomersRouter = () => {
  const router = Router();

  router.post('/', (req, res) => {
    const input = customerSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.status(201).json(customersService.createCustomer(input.data));
  });

  router.get('/', (_req, res) => {
    return res.json(customersService.listCustomers());
  });

  router.get('/:id', (req, res) => {
    const id = parseIdParam(req, res, 'customer');
    if (id === undefined) {
      return;
    }

    const customer = customersService.getCustomer(id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    return res.json(customer);
  });

  router.patch('/:id', (req, res) => {
    const id = parseIdParam(req, res, 'customer');
    const input = customerUpdateSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const customer = customersService.updateCustomer(id, input.data);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    return res.json(customer);
  });

  router.delete('/:id', (req, res) => {
    const id = parseIdParam(req, res, 'customer');
    if (id === undefined) {
      return;
    }

    if (!customersService.removeCustomer(id)) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    return res.status(204).send();
  });

  return router;
};
