# Repository Guidelines

## Project Structure & Module Organization

This is a Node.js + TypeScript modular monolith backend for a small SME ERP. Source files live in `src/`: `index.ts` starts the REST server, `app/rest.ts` composes REST routers. Business code lives under `src/modules/` by domain: `auth`, `customers`, `product`, `order`, `credit`, `finance`, and `billing`. The `order` module owns both orders and order items; its persistence layer lives under `src/modules/order/repository/` (`order.repository.ts` and `order-item.repository.ts`) rather than as a separate top-level module, since order items have no lifecycle independent of their parent order. Shared primitives live in `src/shared/`: `types.ts` (domain interfaces), `persistence.ts` (Mongoose models and DB helpers), `errors.ts` (typed HTTP errors), `http.ts` (common request validation), `gcs.ts` (Google Cloud Storage), `openai.ts` (OpenAI client), `pdf.ts` (PDF generation), `currency.ts`, `filters.ts`, `pagination.ts`, `moment.ts`, `env.ts` (environment loading), and `store.ts` (legacy in-memory store). The root `restApp.ts`, `services.ts`, `store.ts`, `types.ts`, and `auth.ts` files are legacy compatibility layers (re-exports/wiring); avoid adding new behavior there. Tests live in `tests/`. Build output is written to `dist/` and should not be edited directly.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: run `src/index.ts` with `tsx watch`; starts REST on `REST_PORT` or `8000`.
- `npm run dev:debug`: run with the Node inspector attached for debugging.
- `npm run build`: compile TypeScript with `tsc -p tsconfig.json` into `dist/`.
- `npm start`: run the compiled app from `dist/index.js`.
- `npm test`: run Vitest once with the configured test suite.

## Coding Style & Naming Conventions

Use strict TypeScript and keep modules focused by business responsibility. Follow the existing style: two-space indentation, single quotes, semicolons, named exports for app factories and helpers, and descriptive camelCase identifiers. Each domain module should keep validation in `schemas.ts`, persistence access in `repository.ts` (or a `repository/` folder for modules with multiple entities), business rules in `service.ts`, and REST handlers in `routes.ts`. Do not call repositories directly from routes; go through the module service. Repositories must explicitly whitelist the fields they persist or update in MongoDB and must not spread or pass through whole user-controlled payloads into `create`, `$set`, or other write operations. Keep cross-domain workflows explicit: `order` owns orders and order items, `credit` owns customer credits/balances, `finance` owns payment transactions, and `billing` owns billing documents that reference orders. Use the `OrderCreditPort` port/adapter pattern when `order` needs to trigger credit operations.

## Data Layer

All entities use MongoDB via Mongoose with `ObjectId` (`Types.ObjectId`) as the primary key type. Multi-step writes must use `runInTransaction` (or `withSession` when a session may already be open) from `src/shared/persistence.ts`. Use `nextSequence` for auto-incrementing counters (e.g. delivery note numbers). Models are defined in `src/shared/persistence.ts` alongside `initiateDb`, `disconnectPersistence`, and `assertDbReady` helpers.

Most entities are soft-deleted via a `deletedAt` timestamp filtered as `deletedAt: null` in queries. Order items are the exception: because an order edit rewrites its entire item set, replacing items hard-deletes the previous rows (`orderItemRepository.hardDeleteByOrderId`) instead of soft-deleting them, to avoid unbounded growth from routine edits. Full order removal still soft-deletes order items (`removeByOrderId`), consistent with the parent order itself being soft-deleted on that path. Don't reintroduce soft-delete on the edit-replace path without addressing the growth issue it was added to fix.

## Testing Guidelines

Tests use Vitest with Supertest. Name test files `*.test.ts` under `tests/`; the Vitest config includes `tests/**/*.test.ts` and excludes `dist/` and `node_modules/`. Integration tests that hit MongoDB are guarded with `describeIfMongo` (skipped when `MONGODB_URI` is not set). Add coverage for both successful behavior and important error paths when changing routes, schemas, service logic, or cross-module workflows such as order creation, credit status updates, and finance payment application. Run `npm test` before submitting changes.

## Commit & Pull Request Guidelines

Recent commits follow Conventional Commits (`feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`) with short, imperative summaries. Keep commit subjects concise and action-oriented. Pull requests should describe the behavior change, list affected endpoints or modules, mention new tests, and link any relevant issue. Include example requests or responses when API behavior changes.

## Security & Configuration Tips

Do not commit secrets or local environment files. Configure the port with `REST_PORT`; configure JWT secrets with `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` outside version control. Configure MongoDB with `MONGODB_URI`. Uploaded Excel files are parsed in memory via Multer, so keep file-handling changes explicit about size limits and validation.
