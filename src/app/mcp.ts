import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerSalesMcpTools } from '../modules/sales/mcp';

export const createErpMcpServer = () => {
  const server = new McpServer({
    name: 'small-sme-erp-backend',
    version: '1.0.0'
  });

  registerSalesMcpTools(server);
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
