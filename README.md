# small-sme-erp-backend

Node.js + TypeScript modular monolith backend for a small SME ERP with **two servers in one process**:

- REST API server (default `8000`)

## Persistence

This service now supports a strict MongoDB-backed persistence layer using `mongoose`.

- Package choice: `mongoose`
- Why: it fits MongoDB naturally, enforces runtime schema strictness, and preserves the existing numeric public IDs without forcing Prisma-style `ObjectId` APIs through the whole service.
- Strictness: all Mongo schemas run with `strict: 'throw'`, enum validation, required fields, and validator-backed updates.

MongoDB is required. Set:

```bash
export MONGODB_URI='mongodb://127.0.0.1:27017/sme_erp'
```

Optional:

```bash
export MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000
```

## Run

```bash
nvm use
npm install
npm run dev
```

This project targets Node.js 24.

```bash
MONGODB_URI='mongodb://127.0.0.1:27017/sme_erp' npm run dev
```

If you keep secrets outside the repo, you can load an external env file manually:

```bash
ENV_FILE_PATH='/absolute/path/to/.env' npm run dev
```

or

```bash
npm run dev -- --env-file=/absolute/path/to/.env
```

The external env loader only fills variables that are not already set in the shell.

## OpenAI API setup

The project is wired to use the official OpenAI SDK via [src/shared/openai.ts](/Users/kardsahaphong/Desktop/coding/small-sme-erp-backend/src/shared/openai.ts).

1. Add your credentials to `.env` or another env file:

```bash
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-4.1-mini
```

Optional settings:

```bash
OPENAI_BASE_URL=
OPENAI_ORGANIZATION=
OPENAI_PROJECT=
```

2. The REST health check reports whether OpenAI is configured:

```bash
curl http://localhost:8000/health
```

3. Use the shared helper from application code:

```ts
import { createOpenAiClient, getOpenAiModel } from './shared/openai';

const client = createOpenAiClient();
const model = getOpenAiModel();
```

The helper throws if `OPENAI_API_KEY` is missing, so API-backed features fail fast instead of silently misconfiguring.

## Tests

The test suite is Mongo-backed. Set `MONGODB_URI` before running `npm test`.

If `MONGODB_URI` is not set, the suite skips instead of falling back to the removed in-memory store.

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
- `POST /api/v1/orders/ocr` (accepts `{ "imageUrls": ["https://..."] }` and returns an OCR-based order draft)

Example OCR request:

```bash
curl -X POST http://localhost:8000/api/v1/orders/ocr \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"imageUrls":["https://example.com/order.jpg"]}'
```

## Modular monolith structure

Business modules live under `src/modules/`:

- `auth`
- `catalog`
- `customers`
- `sales`
- `credit`
- `finance`

Application composition lives in `src/app/`, while shared persistence and common helpers live in `src/shared/`.
