import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db, nextCustomerId, nextProductId, paginate } from './store';
import { applyFinancialTransaction, createOrderWithCredit, mapOrderStatusFromCredit, removeFinancialTransaction, removeOrder, replaceFinancialTransaction } from './services';

const upload = multer({ storage: multer.memoryStorage() });

const numberParam = z.coerce.number().int().positive();
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10)
});

const productSchema = z.object({
  productName: z.string().min(1),
  unit: z.string().min(1),
  defaultBuyPrice: z.coerce.number().nonnegative(),
  defaultSellPrice: z.coerce.number().nonnegative()
});

const customerSchema = z.object({
  customerName: z.string().min(1),
  address: z.string().min(1),
  billName: z.string().min(1)
});

const orderInputSchema = z.object({
  productId: z.coerce.number().int().positive(),
  productName: z.string().min(1),
  unit: z.string().min(1),
  buyPrice: z.coerce.number().nonnegative(),
  sellPrice: z.coerce.number().nonnegative(),
  customerId: z.coerce.number().int().positive(),
  dueDate: z.string().min(1),
  status: z.enum(['pending', 'completed', 'cancelled'])
});

const customerCreditSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  customerId: z.coerce.number().int().positive(),
  totalAmount: z.coerce.number().nonnegative(),
  paidAmount: z.coerce.number().nonnegative().default(0),
  status: z.enum(['pending', 'paid', 'cancelled'])
});

const financialSchema = z.object({
  customerCreditId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  paymentDate: z.string().min(1).default(() => new Date().toISOString()),
  note: z.string().optional()
});

export const createRestApp = () => {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, server: 'rest' });
  });

  app.post('/products', (req, res) => {
    const input = productSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    const product = { id: nextProductId(), ...input.data };
    db.products.push(product);
    return res.status(201).json(product);
  });

  app.post('/products/upload-excel', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Excel file is required' });
    }

    const { default: readXlsxFile } = await import('read-excel-file/node');
    const rows = await readXlsxFile(req.file.buffer);
    const dataRows = rows.slice(1) as unknown as Array<Array<string | number | undefined>>;
    const created = [];
    for (const row of dataRows) {
      const [productName, unit, defaultBuyPrice, defaultSellPrice] = row;
      const parsed = productSchema.safeParse({ productName, unit, defaultBuyPrice, defaultSellPrice });
      if (!parsed.success) {
        continue;
      }
      const product = { id: nextProductId(), ...parsed.data };
      db.products.push(product);
      created.push(product);
    }

    return res.status(201).json({ inserted: created.length, data: created });
  });

  app.get('/products', (req, res) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    return res.json(paginate(db.products, parsed.data.page, parsed.data.pageSize));
  });

  app.put('/products/:id', (req, res) => {
    const id = numberParam.safeParse(req.params.id);
    const input = productSchema.partial().safeParse(req.body);
    if (!id.success || !input.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const product = db.products.find((item) => item.id === id.data);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    Object.assign(product, input.data);
    return res.json(product);
  });

  app.delete('/products/:id', (req, res) => {
    const id = numberParam.safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const idx = db.products.findIndex((item) => item.id === id.data);
    if (idx < 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    db.products.splice(idx, 1);
    return res.status(204).send();
  });

  app.post('/customers', (req, res) => {
    const input = customerSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    const customer = { customerId: nextCustomerId(), ...input.data };
    db.customers.push(customer);
    return res.status(201).json(customer);
  });

  app.get('/customers', (_req, res) => {
    return res.json(db.customers);
  });

  app.get('/customers/:id', (req, res) => {
    const id = numberParam.safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ error: 'Invalid customer id' });
    }

    const customer = db.customers.find((item) => item.customerId === id.data);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    return res.json(customer);
  });

  app.put('/customers/:id', (req, res) => {
    const id = numberParam.safeParse(req.params.id);
    const input = customerSchema.partial().safeParse(req.body);
    if (!id.success || !input.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const customer = db.customers.find((item) => item.customerId === id.data);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    Object.assign(customer, input.data);
    return res.json(customer);
  });

  app.delete('/customers/:id', (req, res) => {
    const id = numberParam.safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ error: 'Invalid customer id' });
    }

    const idx = db.customers.findIndex((item) => item.customerId === id.data);
    if (idx < 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    db.customers.splice(idx, 1);
    return res.status(204).send();
  });

  app.post('/orders', (req, res) => {
    const input = orderInputSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    const response = createOrderWithCredit(input.data);
    return res.status(201).json(response);
  });

  app.get('/orders', (req, res) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    return res.json(paginate(db.orders, parsed.data.page, parsed.data.pageSize));
  });

  app.put('/orders/:id', (req, res) => {
    const id = numberParam.safeParse(req.params.id);
    const input = orderInputSchema.partial().safeParse(req.body);
    if (!id.success || !input.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const order = db.orders.find((item) => item.id === id.data);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    Object.assign(order, input.data);

    const credit = db.customerCredits.find((item) => item.orderId === order.id);
    if (credit) {
      if (typeof input.data.sellPrice === 'number') {
        credit.totalAmount = input.data.sellPrice;
      }
      if (typeof input.data.customerId === 'number') {
        credit.customerId = input.data.customerId;
      }
      if (input.data.status) {
        credit.status = input.data.status === 'completed' ? 'paid' : input.data.status;
      }
    }

    return res.json(order);
  });

  app.delete('/orders/:id', (req, res) => {
    const id = numberParam.safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const removed = removeOrder(id.data);
    if (!removed) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.status(204).send();
  });

  app.post('/customer-credits', (req, res) => {
    const input = customerCreditSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    const id = db.customerCredits.length ? Math.max(...db.customerCredits.map((item) => item.id)) + 1 : 1;
    const credit = { id, ...input.data };
    db.customerCredits.push(credit);
    return res.status(201).json(credit);
  });

  app.get('/customer-credits', (_req, res) => {
    return res.json(db.customerCredits);
  });

  app.get('/customer-credits/:id', (req, res) => {
    const id = numberParam.safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ error: 'Invalid customer credit id' });
    }

    const credit = db.customerCredits.find((item) => item.id === id.data);
    if (!credit) {
      return res.status(404).json({ error: 'Customer credit not found' });
    }

    return res.json(credit);
  });

  app.put('/customer-credits/:id', (req, res) => {
    const id = numberParam.safeParse(req.params.id);
    const input = customerCreditSchema.partial().safeParse(req.body);
    if (!id.success || !input.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const credit = db.customerCredits.find((item) => item.id === id.data);
    if (!credit) {
      return res.status(404).json({ error: 'Customer credit not found' });
    }

    Object.assign(credit, input.data);

    const order = db.orders.find((item) => item.id === credit.orderId);
    if (order) {
      order.status = mapOrderStatusFromCredit(credit.status);
    }

    return res.json(credit);
  });

  app.delete('/customer-credits/:id', (req, res) => {
    const id = numberParam.safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ error: 'Invalid customer credit id' });
    }

    const idx = db.customerCredits.findIndex((item) => item.id === id.data);
    if (idx < 0) {
      return res.status(404).json({ error: 'Customer credit not found' });
    }

    db.customerCredits.splice(idx, 1);
    db.financials = db.financials.filter((tx) => tx.customerCreditId !== id.data);
    return res.status(204).send();
  });

  app.post('/financials', (req, res) => {
    const input = financialSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    try {
      const tx = applyFinancialTransaction(input.data);
      return res.status(201).json(tx);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/financials', (_req, res) => {
    return res.json(db.financials);
  });

  app.get('/financials/:id', (req, res) => {
    const id = numberParam.safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ error: 'Invalid financial transaction id' });
    }

    const tx = db.financials.find((item) => item.id === id.data);
    if (!tx) {
      return res.status(404).json({ error: 'Financial transaction not found' });
    }

    return res.json(tx);
  });

  app.put('/financials/:id', (req, res) => {
    const id = numberParam.safeParse(req.params.id);
    const input = financialSchema.safeParse(req.body);
    if (!id.success || !input.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    try {
      const tx = replaceFinancialTransaction(id.data, input.data);
      return res.json(tx);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete('/financials/:id', (req, res) => {
    const id = numberParam.safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ error: 'Invalid financial transaction id' });
    }

    const removed = removeFinancialTransaction(id.data);
    if (!removed) {
      return res.status(404).json({ error: 'Financial transaction not found' });
    }

    return res.status(204).send();
  });

  return app;
};
