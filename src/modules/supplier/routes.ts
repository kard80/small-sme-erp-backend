import { Router } from 'express';
import { paginationSchema, parseObjectIdParam } from '../../shared/http';
import { supplierProductsSchema, supplierSchema, supplierUpdateSchema } from './schemas';
import { supplierService } from './service';

export const createSuppliersRouter = () => {
  const router = Router();

  router.post('/', async (req, res) => {
    const input = supplierSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.status(201).json(await supplierService.createSupplier(input.data));
  });

  router.get('/', async (req, res) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    return res.json(await supplierService.listSuppliers(parsed.data.page, parsed.data.pageSize));
  });

  router.get('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'ผู้ขาย');
    if (id === undefined) {
      return;
    }

    const supplier = await supplierService.getSupplier(id);
    if (!supplier) {
      return res.status(404).json({ error: 'ไม่พบผู้ขาย' });
    }

    return res.json(supplier);
  });

  router.patch('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'ผู้ขาย');
    const input = supplierUpdateSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' });
    }

    const supplier = await supplierService.updateSupplier(id, input.data);
    if (!supplier) {
      return res.status(404).json({ error: 'ไม่พบผู้ขาย' });
    }

    return res.json(supplier);
  });

  router.delete('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'ผู้ขาย');
    if (id === undefined) {
      return;
    }

    if (!(await supplierService.removeSupplier(id))) {
      return res.status(404).json({ error: 'ไม่พบผู้ขาย' });
    }

    return res.status(204).send();
  });

  router.get('/:id/products', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'ผู้ขาย');
    if (id === undefined) {
      return;
    }

    return res.json(await supplierService.listProductsOfSupplier(id));
  });

  router.put('/:id/products', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'ผู้ขาย');
    const input = supplierProductsSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.json(await supplierService.replaceProductsOfSupplier(id, input.data));
  });

  return router;
};
