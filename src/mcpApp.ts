import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';
import { createOrderWithCredit } from './services';

const orderInputSchema = {
  productId: z.coerce.number().int().positive().describe('Product ID'),
  productName: z.string().min(1).describe('Product name'),
  unit: z.string().min(1).describe('Product unit, for example pcs or box'),
  buyPrice: z.coerce.number().nonnegative().describe('Purchase price'),
  sellPrice: z.coerce.number().nonnegative().describe('Sale price'),
  customerId: z.coerce.number().int().positive().describe('Customer ID'),
  dueDate: z.string().min(1).describe('Due date as an ISO date string'),
  status: z.enum(['pending', 'completed', 'cancelled']).describe('Order status')
};

const supportedImageMimeTypes = ['image/png', 'image/jpeg', 'image/webp'] as const;

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

const imageInputSchema = {
  imageBase64: z.string().min(1).describe('Base64-encoded image bytes without a data URL prefix'),
  mimeType: z.enum(supportedImageMimeTypes).describe('Image MIME type')
};

export const createErpMcpServer = () => {
  const server = new McpServer({
    name: 'small-sme-erp-backend',
    version: '1.0.0'
  });

  server.registerTool('orders.insert', {
    title: 'Insert order',
    description: 'Create an ERP order and automatically create its customer credit record.',
    inputSchema: orderInputSchema,
    outputSchema: {
      order: z.object({
        id: z.number(),
        ...orderInputSchema
      }),
      credit: z.object({
        id: z.number(),
        orderId: z.number(),
        customerId: z.number(),
        totalAmount: z.number(),
        paidAmount: z.number(),
        status: z.enum(['pending', 'paid', 'cancelled'])
      })
    }
  }, async (input) => {
    const structuredContent = createOrderWithCredit(input);
    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent
    };
  });

  server.registerTool('parse-order-text', {
    title: 'Parse order text',
    description: 'Parse already-extracted OCR text into an order draft.',
    inputSchema: {
      text: z.string().min(1).describe('OCR text with key: value lines')
    },
    outputSchema: {
      orderDraft: z.object(orderInputSchema)
    }
  }, async ({ text }) => {
    const structuredContent = { orderDraft: toOrderDraft(text) };
    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent
    };
  });

  server.registerTool('parse-order-image', {
    title: 'Parse order image',
    description: 'Accept an order image for OCR parsing. OCR integration is not configured yet.',
    inputSchema: imageInputSchema,
    outputSchema: {
      status: z.enum(['ocr_not_configured']),
      message: z.string(),
      acceptedImage: z.object({
        mimeType: z.enum(supportedImageMimeTypes),
        byteLength: z.number()
      })
    }
  }, async ({ imageBase64, mimeType }) => {
    const byteLength = Buffer.from(imageBase64, 'base64').byteLength;
    const structuredContent = {
      status: 'ocr_not_configured' as const,
      message: 'Image input was accepted, but OCR service integration has not been configured yet.',
      acceptedImage: {
        mimeType,
        byteLength
      }
    };

    return {
      isError: true,
      content: [{ type: 'text', text: structuredContent.message }],
      structuredContent
    };
  });

  return server;
};

export const createMcpApp = () => {
  const app = createMcpExpressApp();

  app.get('/health', (_req, res) => {
    res.json({ ok: true, server: 'mcp' });
  });

  app.post('/mcp', async (req, res) => {
    const server = createErpMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal server error'
          },
          id: null
        });
      }
    }
  });

  app.get('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null
    });
  });

  app.delete('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null
    });
  });

  return app;
};
