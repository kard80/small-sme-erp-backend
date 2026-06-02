import { Router } from 'express';
import multer from 'multer';
import { paginationSchema, parseObjectIdParam } from '../../shared/http';
import { createProductSchema, productUpdateSchema } from './schemas';
import { productService } from './service';

const upload = multer({ storage: multer.memoryStorage() });

type ProductImportRow = Array<string | number | undefined>;
type ProductImportSheet = {
  sheet: string;
  data: Array<Array<string | number | undefined>>;
};

const isSheetArray = (value: unknown): value is ProductImportSheet[] =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      'sheet' in entry &&
      'data' in entry &&
      Array.isArray(entry.data)
  );

export const extractProductImportRows = (value: unknown): ProductImportRow[] => {
  const rows = isSheetArray(value) ? value[0]?.data ?? [] : Array.isArray(value) ? value : [];
  return rows
    .slice(1)
    .map((row) => {
      if (!Array.isArray(row)) {
        return [];
      }

      const [productName, unit, sellPrice, defaultBuyPrice, status] = row;
      return [productName, unit, defaultBuyPrice, sellPrice, status] as ProductImportRow;
    });
};

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
      return res.status(400).json({ error: 'กรุณาอัปโหลดไฟล์ Excel' });
    }

    const { default: readXlsxFile } = await import('read-excel-file/node');
    const rows = await readXlsxFile(req.file.buffer);
    const dataRows = extractProductImportRows(rows);
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
    const id = parseObjectIdParam(req, res, 'สินค้า');
    const input = productUpdateSchema.safeParse(req.body);
    if (id === undefined) {
      return;
    }
    if (!input.success) {
      return res.status(400).json({ error: 'คำขอไม่ถูกต้อง' });
    }

    const product = await productService.updateProduct(id, input.data);
    if (!product) {
      return res.status(404).json({ error: 'ไม่พบสินค้า' });
    }

    return res.json(product);
  });

  router.delete('/:id', async (req, res) => {
    const id = parseObjectIdParam(req, res, 'สินค้า');
    if (id === undefined) {
      return;
    }

    if (!(await productService.removeProduct(id))) {
      return res.status(404).json({ error: 'ไม่พบสินค้า' });
    }

    return res.status(204).send();
  });

  return router;
};
