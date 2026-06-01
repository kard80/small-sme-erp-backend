# small-sme-erp-backend

Node.js + TypeScript backend for a small SME ERP with **two servers in one process**:

- REST API server (default `3000`)
- MCP server (default `3001`)

## Run

```bash
npm install
npm run dev
```

## REST API

- `POST /products`
- `POST /products/upload-excel` (multipart form-data, file field: `file`)
- `GET /products?page=1&pageSize=10`
- `PUT /products/:id`
- `DELETE /products/:id`
- `POST /customers`
- `GET /customers`
- `GET /customers/:id`
- `PUT /customers/:id`
- `DELETE /customers/:id`
- `POST /orders` (auto-create customer credit)
- `GET /orders?page=1&pageSize=10`
- `PUT /orders/:id`
- `DELETE /orders/:id`
- `POST /customer-credits`
- `GET /customer-credits`
- `GET /customer-credits/:id`
- `PUT /customer-credits/:id`
- `DELETE /customer-credits/:id`
- `POST /financials` (supports partial payment)
- `GET /financials`
- `GET /financials/:id`
- `PUT /financials/:id`
- `DELETE /financials/:id`

## MCP API

The MCP server uses Streamable HTTP at:

- `POST /mcp`

Available MCP tools:

- `parse-order-text` (accepts OCR text and returns an order draft)
- `parse-order-image` (accepts `imageBase64` + `mimeType`; OCR service integration pending)
- `orders.insert`
