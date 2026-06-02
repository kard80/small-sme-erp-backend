# Repository Guidelines

## Project Structure & Module Organization

This is a Node.js + TypeScript modular monolith backend for a small SME ERP. Source files live in `src/`: `index.ts` starts both servers, `app/rest.ts` composes REST routers, and `app/mcp.ts` composes MCP tools. Business code lives under `src/modules/` by domain: `auth`, `catalog`, `customers`, `sales`, `credit`, and `finance`. Shared primitives live in `src/shared/`, including in-memory store helpers and common HTTP validation helpers. The root `restApp.ts`, `mcpApp.ts`, `services.ts`, `store.ts`, and `types.ts` files are compatibility re-export layers; avoid adding new behavior there. Tests live in `tests/` and currently use `tests/api.test.ts` for REST and MCP endpoint coverage. Build output is written to `dist/` and should not be edited directly.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: run `src/index.ts` with `tsx`; starts REST on `REST_PORT` or `8000` and MCP on `MCP_PORT` or `3001`.
- `npm run build`: compile TypeScript with `tsc -p tsconfig.json` into `dist/`.
- `npm start`: run the compiled app from `dist/index.js`.
- `npm test`: run Vitest once with the configured test suite.

## Coding Style & Naming Conventions

Use strict TypeScript and keep modules focused by business responsibility. Follow the existing style: two-space indentation, single quotes, semicolons, named exports for app factories and helpers, and descriptive camelCase identifiers. Each domain module should keep validation in `schemas.ts`, persistence access in `repository.ts`, business rules in `service.ts`, REST handlers in `routes.ts`, and MCP tool registration in `mcp.ts` when needed. Do not mutate `db` directly from routes; go through the module service or repository. Repositories must explicitly whitelist the fields they persist or update in MongoDB and must not spread or pass through whole user-controlled payloads into `create`, `$set`, or other write operations. Keep cross-domain workflows explicit: `sales` owns orders, `credit` owns customer credits/balances, and `finance` owns payment transactions.

## Testing Guidelines

Tests use Vitest with Supertest. Name test files `*.test.ts` under `tests/`; the Vitest config includes `tests/**/*.test.ts` and excludes `dist/` and `node_modules/`. Reset mutable state with `resetInMemoryStore()` before tests that mutate data. Add coverage for both successful behavior and important error paths when changing routes, schemas, service logic, or cross-module workflows such as order creation, credit status updates, and finance payment application. Run `npm test` before submitting changes.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `Implement minimal ERP REST and MCP backend with tests`. Keep commit subjects concise and action-oriented. Pull requests should describe the behavior change, list affected endpoints or modules, mention new tests, and link any relevant issue. Include example requests or responses when API behavior changes.

## Security & Configuration Tips

Do not commit secrets or local environment files. Configure ports with `REST_PORT` and `MCP_PORT`; configure JWT secrets with `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` outside version control. Uploaded Excel files are parsed in memory via Multer, so keep file-handling changes explicit about size limits and validation.
