# Testing

## Commands

| Command                | What it runs                                           |
| ---------------------- | ------------------------------------------------------ |
| `pnpm test`            | Unit tests **and** E2E tests (full suite)              |
| `pnpm test:unit`       | Unit tests only                                        |
| `pnpm test:unit:watch` | Unit tests in watch mode                               |
| `pnpm test:unit:cov`   | Unit tests with coverage report (output: `coverage/`)  |
| `pnpm test:e2e`        | E2E tests only (automatically run infrastucture below) |
| `pnpm test:e2e:up`     | Start Docker services required for E2E tests           |
| `pnpm test:e2e:down`   | Stop and remove Docker services                        |
| `pnpm test:debug`      | Unit tests with Node.js debugger attached              |

---

## Unit Tests

Unit tests live next to their source files as `*.spec.ts`. They have no external dependencies — every database, queue, external SDK, and HTTP call is mocked.

### Jest config (inline in `package.json`)

```json
{
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "moduleNameMapper": { "^(\\.{1,2}/.+)\\.js$": "$1" },
  "testEnvironment": "node"
}
```

`moduleNameMapper` rewrites `.js` import specifiers to their `.ts` source files so ts-jest can resolve them without the compiled output.

### Mocking conventions

All unit tests follow the same isolation contract:

- **TypeORM repositories** — mocked with a plain object exposing the methods used (`find`, `findOne`, `findAndCount`, `findOneByOrFail`, `save`, `create`, `createQueryBuilder`, etc.). The query builder is a separate mock object whose chainable methods return `this`.
- **BullMQ Queues** — mocked with `{ add: jest.fn(), addBulk: jest.fn(), getJob: jest.fn() }`.
- **External SDKs** (Anthropic, OpenAI, Exa) — mocked via `jest.mock('<package>', ...)` at the top of the file, replacing the constructor and relevant methods.
- **ioredis** — mocked with `jest.mock('ioredis', ...)`, replacing `connect`, `set`, `decr`, `del`.
- **axios** — mocked with `jest.mock('axios')` + per-test `mockResolvedValue`/`mockRejectedValue`.
- **compromise** (NLP library) — mocked with `jest.mock('compromise', ...)` returning a configurable `nlp()` stub.
- **Rate limiters** (`webRateLimiter`, `exaRateLimiter`, `secEdgarRateLimiter`) — mocked so `wrap()` calls the function directly without delay: `jest.fn((fn) => fn())`.
- **Node built-ins** (`fs.readFileSync`, `fs.existsSync`, `fs.mkdirSync`, `fs.writeFileSync`) — spied on with `jest.spyOn` per test when file I/O needs to be controlled.

No test asserts on logger output (`logger.log`, `logger.warn`, `logger.error`).

---

## E2E Tests

E2E tests live in `test/` and are configured by `test/jest-e2e.json`. They boot the full NestJS application against a real PostgreSQL database and Redis instance.

```bash
pnpm test:e2e # starts infrastructure and runs the suite
```

The Docker Compose file is `docker-compose.test.yml`. It configures isolated containers on a test-only network so they do not conflict with a local development stack.

### What is tested

End-to-end tests cover HTTP-level behaviour through the full NestJS stack (controllers → services → database). Each test suite:

1. Boots the application once with `createTestApp()`.
2. Truncates all tables before each test to guarantee isolation.
3. Seeds data via repository fixture helpers (`createFirm`, `createFirmScore`, etc.).
4. Makes HTTP requests with `supertest` and asserts on status codes and response bodies.

---

## Coverage

Run `pnpm test:unit:cov` to generate an LCOV report in `coverage/`. The `collectCoverageFrom` option in the Jest config captures every `*.ts` source file under `src/`.
