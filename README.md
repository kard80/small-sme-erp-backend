# small-sme-erp-backend

Node.js + TypeScript modular monolith backend for a small SME ERP with **two servers in one process**:

- REST API server (default `3000`)
- MCP server (default `3001`)

## Run

```bash
npm install
npm run dev
```

## REST API

Authentication:

- `POST /api/auth/login` (temporary credential: `admin` / `1234`)
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

All ERP REST endpoints require `Authorization: Bearer <accessToken>`.

- `POST /api/catalog/products`
- `POST /api/catalog/products/import-excel` (multipart form-data, file field: `file`)
- `GET /api/catalog/products?page=1&pageSize=10`
- `PATCH /api/catalog/products/:id`
- `DELETE /api/catalog/products/:id`
- `POST /api/customers`
- `GET /api/customers`
- `GET /api/customers/:id`
- `PATCH /api/customers/:id`
- `DELETE /api/customers/:id`
- `POST /api/sales/orders` (auto-create customer credit)
- `GET /api/sales/orders?page=1&pageSize=10`
- `PATCH /api/sales/orders/:id`
- `DELETE /api/sales/orders/:id`
- `POST /api/credit/customer-credits`
- `GET /api/credit/customer-credits`
- `GET /api/credit/customer-credits/:id`
- `PATCH /api/credit/customer-credits/:id`
- `DELETE /api/credit/customer-credits/:id`
- `POST /api/finance/payments` (supports partial payment)
- `GET /api/finance/payments`
- `GET /api/finance/payments/:id`
- `PATCH /api/finance/payments/:id`
- `DELETE /api/finance/payments/:id`

## MCP API

The MCP server uses Streamable HTTP at:

- `POST /mcp`

Available MCP tools:

- `sales.orders.parseText` (accepts OCR text and returns an order draft)
- `sales.orders.parseImage` (accepts `imageBase64` + `mimeType`; OCR service integration pending)
- `sales.orders.create`

## Modular monolith structure

Business modules live under `src/modules/`:

- `auth`
- `catalog`
- `customers`
- `sales`
- `credit`
- `finance`

Application composition lives in `src/app/`, while shared in-memory persistence and common helpers live in `src/shared/`.
