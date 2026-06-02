import { Router } from 'express';
import multer from 'multer';
import { parseIdParam, paginationSchema } from '../../shared/http';
import { createProductSchema, productUpdateSchema } from './schemas';
import { productService } from './service';

const upload = multer({ storage: multer.memoryStorage() });

export const createProductRouter = () => {
  const router = Router();

  router.post('/', async (req, res) => {
    const input = createProductSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.status(201).json(await productService.createProduct({ ...input.data, status: 'active' }));
  });

  router.post('/import-excel', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Excel file is required' });
    }

    const { default: readXlsxFile } = await import('read-excel-file/node');
    const rows = await readXlsxFile(req.file.buffer);
    const dataRows = rows.slice(1) as unknown as Array<Array<string | number | undefined>>;
    return res.status(201).json(await productService.importProducts(dataRows));
  });

  router.get('/', async (req, res) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    return res.json(await productService.listProducts(parsed.data.page, parsed.data.pageSize));
  });

  router.patch('/:id', async (req, res) => {
    const id = parseIdParam(req, res, 'product');
    const input = productUpdateSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const product = await productService.updateProduct(id, input.data);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json(product);
  });

  router.delete('/:id', async (req, res) => {
    const id = parseIdParam(req, res, 'product');
    if (id === undefined) {
      return;
    }

    if (!(await productService.removeProduct(id))) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.status(204).send();
  });

  return router;
};
