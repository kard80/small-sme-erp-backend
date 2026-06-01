# Repository Guidelines

## Project Structure & Module Organization

This is a Node.js + TypeScript backend for a small SME ERP. Source files live in `src/`: `index.ts` starts both servers, `restApp.ts` defines REST routes, `mcpApp.ts` defines MCP tool endpoints, `services.ts` holds shared business logic, `store.ts` contains the in-memory data store, and `types.ts` contains domain types. Tests live in `tests/` and currently use `tests/api.test.ts` for REST and MCP endpoint coverage. Build output is written to `dist/` and should not be edited directly.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: run `src/index.ts` with `tsx`; starts REST on `REST_PORT` or `3000` and MCP on `MCP_PORT` or `3001`.
- `npm run build`: compile TypeScript with `tsc -p tsconfig.json` into `dist/`.
- `npm start`: run the compiled app from `dist/index.js`.
- `npm test`: run Vitest once with the configured test suite.

## Coding Style & Naming Conventions

Use strict TypeScript and keep modules focused by responsibility. Follow the existing style: two-space indentation, single quotes, semicolons, named exports for app factories and helpers, and descriptive camelCase identifiers. Keep validation close to route definitions with `zod` schemas. Put shared workflow rules in `services.ts` instead of duplicating logic between REST and MCP handlers.

## Testing Guidelines

Tests use Vitest with Supertest. Name test files `*.test.ts` under `tests/`; the Vitest config includes `tests/**/*.test.ts` and excludes `dist/` and `node_modules/`. Reset the in-memory `db` before tests that mutate state. Add coverage for both successful behavior and important error paths when changing routes, schemas, or service logic. Run `npm test` before submitting changes.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `Implement minimal ERP REST and MCP backend with tests`. Keep commit subjects concise and action-oriented. Pull requests should describe the behavior change, list affected endpoints or modules, mention new tests, and link any relevant issue. Include example requests or responses when API behavior changes.

## Security & Configuration Tips

Do not commit secrets or local environment files. Configure ports with `REST_PORT` and `MCP_PORT`. Uploaded Excel files are parsed in memory via Multer, so keep file-handling changes explicit about size limits and validation.
