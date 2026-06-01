import { Router } from 'express';
import multer from 'multer';
import { parseIdParam, paginationSchema } from '../../shared/http';
import { productSchema, productUpdateSchema } from './schemas';
import { catalogService } from './service';

const upload = multer({ storage: multer.memoryStorage() });

export const createCatalogRouter = () => {
  const router = Router();

  router.post('/products', (req, res) => {
    const input = productSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.status(201).json(catalogService.createProduct(input.data));
  });

  router.post('/products/import-excel', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Excel file is required' });
    }

    const { default: readXlsxFile } = await import('read-excel-file/node');
    const rows = await readXlsxFile(req.file.buffer);
    const dataRows = rows.slice(1) as unknown as Array<Array<string | number | undefined>>;
    return res.status(201).json(catalogService.importProducts(dataRows));
  });

  router.get('/products', (req, res) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    return res.json(catalogService.listProducts(parsed.data.page, parsed.data.pageSize));
  });

  router.patch('/products/:id', (req, res) => {
    const id = parseIdParam(req, res, 'product');
    const input = productUpdateSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const product = catalogService.updateProduct(id, input.data);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json(product);
  });

  router.delete('/products/:id', (req, res) => {
    const id = parseIdParam(req, res, 'product');
    if (id === undefined) {
      return;
    }

    if (!catalogService.removeProduct(id)) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.status(204).send();
  });

  return router;
};
