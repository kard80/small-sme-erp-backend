import express from 'express';
import { z } from 'zod';
import { createOrderWithCredit } from './services';

const createOrderSchema = z.object({
  productId: z.coerce.number().int().positive(),
  productName: z.string().min(1),
  unit: z.string().min(1),
  buyPrice: z.coerce.number().nonnegative(),
  sellPrice: z.coerce.number().nonnegative(),
  customerId: z.coerce.number().int().positive(),
  dueDate: z.string().min(1),
  status: z.enum(['pending', 'completed', 'cancelled'])
});

const parseTextSchema = z.object({
  text: z.string().min(1)
});

const toOrderDraft = (raw: string) => {
  const lines = raw.split('\n').map((item) => item.trim()).filter(Boolean);
  const map = new Map<string, string>();
  for (const line of lines) {
    const [key, ...values] = line.split(':');
    if (!key || values.length === 0) {
      continue;
    }
    map.set(key.trim().toLowerCase(), values.join(':').trim());
  }

  return {
    productId: Number(map.get('productid') || 0),
    productName: map.get('productname') || '',
    unit: map.get('unit') || '',
    buyPrice: Number(map.get('buyprice') || 0),
    sellPrice: Number(map.get('sellprice') || 0),
    customerId: Number(map.get('customerid') || 0),
    dueDate: map.get('duedate') || new Date().toISOString(),
    status: (map.get('status') as 'pending' | 'completed' | 'cancelled' | undefined) || 'pending'
  };
};

export const createMcpApp = () => {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, server: 'mcp' });
  });

  app.post('/tools/orders.insert', (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const created = createOrderWithCredit(parsed.data);
    return res.status(201).json(created);
  });

  app.post('/tools/parse-order-image-text', (req, res) => {
    const parsed = parseTextSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const orderDraft = toOrderDraft(parsed.data.text);
    return res.json({ orderDraft });
  });

  return app;
};
