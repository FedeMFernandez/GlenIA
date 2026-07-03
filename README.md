# Gleni — Transactions Operations Assistant

Gleni is a conversational operations assistant for payments and money-movement teams. Operators describe what they need in plain language — "send a $500 payout to acct-91", "what happened to the last refund?", "list the transfers that failed today" — and Gleni interprets the intent, triggers or reads the right transaction, and answers with real, auditable state.

Under the chat surface is a reliability-first transaction engine: every money-movement action is idempotent, processed asynchronously, retried with backoff on transient failures, and never left stuck in a non-terminal state. The external payments rail sits behind a clean provider port; today it is backed by a **simulation adapter** that models real-world failure modes (latency, timeouts, 5xx, rate limits) so the reliability machinery is exercised end-to-end and the adapter can be swapped for a live rail without touching the core.

---

## Table of contents

1. [What Gleni is](#1-what-gleni-is)
2. [Key features](#2-key-features)
3. [Architecture](#3-architecture)
4. [Tech stack](#4-tech-stack)
5. [Getting started (local)](#5-getting-started-local)
6. [Configuration](#6-configuration)
7. [API reference](#7-api-reference)
8. [Reliability & design decisions](#8-reliability--design-decisions)
9. [LLM & prompt strategy](#9-llm--prompt-strategy)
10. [Deployment](#10-deployment)
11. [Scaling notes — at higher volume](#11-scaling-notes--at-higher-volume)
12. [Observability](#12-observability)
13. [Testing](#13-testing)
14. [Known limitations & roadmap](#14-known-limitations--roadmap)

---

## 1. What Gleni is

**The problem.** Payments and back-office ops teams need a fast, low-friction way to trigger money-movement actions (transfers, payouts, refunds) and to know, with confidence, exactly what happened to each one. Real payment rails are unreliable: they time out, rate-limit, return transient 5xx errors, and occasionally reject requests permanently. Naive integrations lose track of state, double-charge on retries, or leave transactions silently stuck.

**Who it's for.** Fintech and payments engineering teams, plus the support and operations agents who trigger and monitor back-office money movements. More broadly, any product that needs a reliable async-transaction layer behind a natural-language interface.

**The value.** Gleni pairs a chat interface with a transaction engine designed for partial failure. Every transaction is idempotent (double-submit safe), retried with backoff only when it makes sense to retry, always driven to a terminal state, and fully auditable through a per-transaction event trail. Operators get answers grounded in real persisted state — the assistant never invents a transaction id or status.

---

## 2. Key features

- **Natural-language operations.** Describe money movements and queries in plain language; the assistant picks the right action.
- **Effectful and read-only tools.** One tool triggers a real (queued) transaction; two tools read live state (single status with full history, and filtered lists).
- **Durable async pipeline.** Transactions are persisted and processed off the request path through a queue and worker, moving through `pending → processing → succeeded | failed`.
- **Idempotency by construction.** A unique idempotency key (explicit or derived) makes duplicate submissions converge on a single transaction.
- **Retries with backoff.** Transient failures (5xx / timeout / 429) are retried with exponential backoff and jitter; permanent failures (4xx) are not.
- **No stuck transactions.** A stalled-transaction reaper and worker safety nets guarantee every transaction reaches a terminal state.
- **Full audit trail.** Every state transition and retry is recorded as a queryable event.
- **Pluggable provider.** The payments rail is an interface; the current simulation adapter is swappable for a real one with no changes to use cases or the worker.
- **Streaming chat.** Optional Server-Sent Events stream tokens, tool activity, and transaction updates as a turn unfolds.
- **Structured observability.** Structured JSON logs with correlation IDs propagated from the HTTP edge into worker jobs.

---

## 3. Architecture

Gleni is a single Git repository with two sibling projects:

```
.
├── backend/     # Node + TypeScript API + in-process worker & reaper
│   ├── src/                  # Hexagonal layers: domain / application / infrastructure / interface / shared
│   ├── tests/                # Vitest suites (reliability-focused)
│   ├── render.yaml           # Render deploy (rootDir: backend)
│   └── .env.example          # variable reference (real .env is gitignored)
└── frontend/    # Static chat UI (no build step)
    ├── index.html
    ├── app.js
    ├── env.js                # window.GLENI_API_BASE (empty = same-origin)
    ├── package.json          # no deps, no build
    └── styles.css
```

**Serving the UI.** The backend serves the sibling `frontend/` folder as static files via `express.static`, so the UI and the API share a single origin both locally and in production — all API calls are relative (`/api/v1/...`, `/health`) and there is no CORS or cross-origin concern. `frontend/env.js` sets `window.GLENI_API_BASE = ""` (same-origin); it only needs a non-empty value if you ever want to host the static UI on a different origin than the API.

### Hexagonal / clean layering

Dependencies always point inward — outer layers depend on inner layers, never the reverse:

- **`domain/`** — Framework-agnostic core: entities (`Transaction`, `Conversation`, `Message`), status/type constants, the typed `DomainError` hierarchy, and ports (interfaces) such as `TransactionRepository`, `TransactionProvider`, and `LLMProvider`.
- **`application/`** — Use cases (`CreateTransactionUseCase`, `GetTransactionStatusUseCase`, `ListTransactionsUseCase`, `HandleChatMessageUseCase`), the `ProcessTransactionJob`, `StalledTransactionReaper`, `TransactionOrchestrator`, `ToolRegistry`, `LLMService`, and DTO mappers. Depends only on domain ports.
- **`infrastructure/`** — Concrete adapters: TypeORM repositories over Postgres, the `OpenAIGateway`, the `MockTransactionProvider`, BullMQ queue/workers, Redis connection, config loading (`config/env.ts`), and Express app assembly.
- **`interface/`** — The HTTP edge: controllers, routes, and middlewares (correlation id, rate limit, Zod validation, error handling).
- **`shared/`** — Cross-cutting utilities: pino logger, the DI container, id/idempotency helpers, and retry/timeout utilities.

The domain is fully decoupled from the database client: ORM mapping lives in infrastructure via TypeORM `EntitySchema`, while domain entities stay pure objects.

### Async transaction pipeline

An HTTP request (or a chat tool call) only **creates and enqueues** a transaction. A BullMQ worker running in the same process executes it against the provider and drives it to a terminal state. The reaper backstops anything that stalls.

```
                 +-------------------------------------------------------+
                 |                  Node process (single)                |
                 |                                                       |
  client   --->  |  Express (interface)                                  |
  (browser/API)  |     |                                                 |
                 |     v                                                 |
                 |  Use case (application)                               |
                 |     |  createIfAbsent + enqueue (jobId = txnId)       |
                 |     v                                                 |
                 |  BullMQ queue  --->  BullMQ worker  --->  Provider    |
                 |  (Redis)              (in-process)        (adapter)   |
                 |                          |                            |
                 |                          v                            |
                 |                   Postgres (persistence)              |
                 |             transactions + transaction_events         |
                 |                                                       |
                 |  StalledTransactionReaper (interval) sweeps stuck     |
                 |  'processing' rows -> terminal 'failed'               |
                 +-------------------------------------------------------+

  Chat path: client -> Express -> HandleChatMessageUseCase -> OpenAI (tool calling)
             -> ToolRegistry (create_transaction triggers the queue path above)
```

The HTTP server, the BullMQ worker, and the reaper are all started by `src/index.ts` in a single Node process, with graceful shutdown on `SIGTERM` / `SIGINT`.

---

## 4. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | **Node.js + TypeScript** (`strict`) | One language across server, worker, and frontend; contract mistakes caught at compile time. |
| HTTP | **Express** | Minimal, composable middleware pipeline (correlation id, rate limit, validation, error handling) and static file serving. |
| Persistence | **Postgres (Supabase-hosted) + TypeORM** | Real relational storage with unique constraints (the backbone of idempotency), JSONB columns, and an events audit table. Accessed via a `DATABASE_URL` connection string; the ORM is an infrastructure detail behind repository ports. |
| Queue | **BullMQ + Redis** | Durable async processing with job-level retries, exponential backoff, and dedup via `jobId`. |
| LLM | **OpenAI native tool calling** | First-class function/tool calling with structured, schema-validated arguments — more reliable than prompt-parsed JSON. |
| Validation | **Zod** | One library for env vars, request bodies, tool arguments, and provider responses. |
| Logging | **pino** | Low-overhead structured JSON logs with child loggers for correlation-id propagation. |
| Frontend | **Vanilla JS** (static) | Zero build step; a single static bundle consuming the same API. |

---

## 5. Getting started (local)

### Prerequisites

- **Node.js 20+**
- A **Postgres** database reachable via a `DATABASE_URL` connection string (a Supabase project's Postgres works well on the free tier).
- A **Redis** instance (local or hosted) for the queue.
- An **OpenAI API key**.

### Steps

All backend commands run from the `backend/` folder.

```bash
cd backend
npm install
```

Create your local environment file from the reference and fill in the values. `.env` is gitignored — never commit real secrets. `.env.example` lists every variable Gleni reads.

```bash
cp .env.example .env
# then edit .env and set at least DATABASE_URL, REDIS_URL, OPENAI_API_KEY
```

> `DATABASE_URL` is a standard Postgres connection string (e.g. `postgresql://user:pass@host:5432/postgres`). With Supabase, copy it from **Project Settings → Database → Connection string (URI)**. Gleni connects to Postgres directly through TypeORM — it does not use the Supabase JS client or PostgREST.

Run the database migration once to create the schema (`conversations`, `messages`, `transactions`, `transaction_events`, plus indexes and the unique idempotency constraint). `synchronize` is disabled, so schema changes only ever happen through migrations.

```bash
npm run migration:run
```

Start the app (HTTP server + worker + reaper in one process):

```bash
npm run dev            # tsx watch, hot reload
# or
npm run build && npm start
```

Open `http://localhost:3000/` — the chat UI is served statically by the backend and talks to `/api/v1` on the same origin, so no separate frontend server is needed locally.

Run the tests:

```bash
npm test               # Vitest, single run
npm run test:watch     # watch mode
npm run test:coverage  # with coverage
```

### Available scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run in watch mode (`tsx watch`). |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm start` | Run the compiled server. |
| `npm run typecheck` | Type-check without emitting. |
| `npm test` / `test:watch` / `test:coverage` | Run the Vitest suite. |
| `npm run migration:run` | Apply pending TypeORM migrations. |
| `npm run migration:revert` | Roll back the last migration. |
| `npm run migration:generate` | Scaffold a migration from schema drift. |

---

## 6. Configuration

All configuration is read from the environment (see `backend/src/infrastructure/config/env.ts`). Values live only in a local, gitignored `.env`; `.env.example` is the canonical list. No real values belong in this repository.

| Variable | Purpose | Required | Default |
| --- | --- | --- | --- |
| `PORT` | HTTP port. | No | `3000` |
| `NODE_ENV` | `development` \| `test` \| `production`. | No | `development` |
| `CORS_ORIGINS` | Comma-separated allowed origins (exact, no trailing slash). Empty allows any origin (for same-origin local dev). | No | *(empty)* |
| `FRONTEND_DIR` | Override path to the static frontend folder. Leave unset to auto-serve the sibling `../frontend`. | No | *(auto)* |
| `DATABASE_URL` | Postgres connection string. | **Yes** | — |
| `DATABASE_SSL` | Enable SSL for the DB connection. | No | `true` |
| `REDIS_URL` | Redis connection string for the queue. | **Yes** | — |
| `OPENAI_API_KEY` | OpenAI API key. | **Yes** | — |
| `OPENAI_MODEL` | Chat model used for tool calling. | No | `gpt-4o-mini` |
| `TRANSACTION_MAX_ATTEMPTS` | Max processing attempts per transaction. | No | `4` |
| `TRANSACTION_TIMEOUT_MS` | Per-provider-call timeout (ms). | No | `8000` |
| `TRANSACTION_BACKOFF_BASE_MS` | Base delay for exponential backoff (ms). | No | `500` |
| `RATE_LIMIT_WINDOW_MS` | Rate-limit window (ms) for `/api/v1`. | No | `60000` |
| `RATE_LIMIT_MAX` | Max requests per IP per window. | No | `60` |
| `MOCK_LATENCY_MS_MIN` | Simulated provider min latency (ms). | No | `100` |
| `MOCK_LATENCY_MS_MAX` | Simulated provider max latency (ms). | No | `1200` |
| `MOCK_TIMEOUT_RATE` | Probability (0–1) of a simulated timeout. | No | `0.1` |
| `MOCK_5XX_RATE` | Probability (0–1) of a simulated transient 5xx. | No | `0.15` |
| `MOCK_429_RATE` | Probability (0–1) of a simulated rate-limit (429). | No | `0.1` |
| `MOCK_4XX_RATE` | Probability (0–1) of a simulated permanent 4xx. | No | `0.05` |
| `STALLED_SWEEP_MS` | How often the reaper runs (ms). | No | `30000` |
| `STALLED_THRESHOLD_MS` | How long a `processing` row may live before being reaped (ms). | No | `60000` |

The four `MOCK_*_RATE` values must be between 0 and 1; invalid or missing required variables cause a clear startup error listing every problem.

---

## 7. API reference

Application routes are mounted under `/api/v1` and rate-limited per IP. A health check is exposed at both `/health` (root, for platform probes) and `/api/v1/health`. Every response echoes an `x-correlation-id` header.

| Method | Path | Body / Query | Response |
| --- | --- | --- | --- |
| GET | `/health` | — | `{ "status": "ok" }` |
| POST | `/api/v1/chat` | `{ conversationId?, message }` | `{ conversationId, message: MessageDTO, transactions: TransactionDTO[] }` |
| POST | `/api/v1/chat/stream` | `{ conversationId?, message }` | `text/event-stream` (SSE, see below) |
| GET | `/api/v1/conversations/:id/messages` | — | `{ conversationId, messages: MessageDTO[] }` |
| POST | `/api/v1/transactions` | `{ type, amount, currency, reference?, destination?, conversationId? }` + optional `Idempotency-Key` header | `201` (created) or `200` (idempotent hit): `{ created, transaction: TransactionDTO }` |
| GET | `/api/v1/transactions` | query: `conversationId?`, `status?`, `limit?` | `{ transactions: TransactionDTO[] }` |
| GET | `/api/v1/transactions/:id` | — | `{ transaction: TransactionDTO }` (includes `events[]`) |

`type` is one of `transfer | payout | refund`; `status` is one of `pending | processing | succeeded | failed | canceled` (`canceled` is reserved as a terminal status).

### Example: create a transaction

```http
POST /api/v1/transactions
Content-Type: application/json
Idempotency-Key: op_demo_key_optional

{
  "type": "payout",
  "amount": 500,
  "currency": "USD",
  "destination": "acct-91",
  "reference": "invoice-2043"
}
```

```json
// 201 Created
{
  "created": true,
  "transaction": {
    "id": "6f2c...",
    "conversationId": null,
    "idempotencyKey": "op_1a2b...",
    "type": "payout",
    "status": "pending",
    "requestPayload": { "amount": 500, "currency": "USD", "destination": "acct-91", "reference": "invoice-2043" },
    "result": null,
    "error": null,
    "attempts": 0,
    "maxAttempts": 4,
    "correlationId": "corr_...",
    "createdAt": "2026-07-03T12:00:00.000Z",
    "updatedAt": "2026-07-03T12:00:00.000Z",
    "startedAt": null,
    "finishedAt": null
  }
}
```

Poll `GET /api/v1/transactions/:id` to watch it move to `processing` and then `succeeded` or `failed`; the response includes the full `events[]` history.

### SSE events for `POST /api/v1/chat/stream`

Each frame is `event: <name>` followed by a JSON `data:` payload.

| Event | Payload | Meaning |
| --- | --- | --- |
| `token` | `{ token }` | Incremental assistant text token. |
| `tool` | `{ name, phase: "start" \| "result", data? }` | A tool call started or produced a result. |
| `transaction` | `{ transactionId, status }` | A transaction was created/affected during the turn. |
| `done` | `{ conversationId, content }` | Turn finished; final assistant content. |
| `error` | `{ code, message }` | Streaming failed. |

---

## 8. Reliability & design decisions

Gleni assumes the payments rail will fail. The engineering below is the point of the product, not an afterthought.

### Idempotency

- **Idempotency key.** Callers may pass an explicit `Idempotency-Key` header. If absent, the key is derived deterministically as a `sha256` over a stable serialization of `{ type, conversationId, payload }`, namespaced to yield `op_<32-hex>`. Identical requests in the same conversation produce the same key; different conversations produce different keys.
- **Database-enforced uniqueness.** The `transactions.idempotency_key` column carries a unique constraint. `createIfAbsent` inserts; on a unique-violation it fetches and returns the existing row with `created: false` (insert-on-conflict-fetch). This is atomic at the database level, so concurrent double-submits converge on one transaction.
- **Queue-level dedup.** The job is enqueued with `jobId = transactionId`, and the use case only enqueues when `created === true`. A duplicate submit returns the existing transaction and never enqueues a second job.

**Trade-off:** deriving the key from the payload means an operator who *intentionally* wants to repeat an identical transaction must vary a field or pass an explicit key. For money movement, defaulting to safety (no accidental double-charge) is the right bias.

### Retries and backoff

- **Retryable vs non-retryable.** Errors are a typed `DomainError` hierarchy with a `retryable` flag. `RateLimitError` (429), `ProviderTransientError` (5xx) and `TimeoutError` (504) are retryable; `ValidationError` (400), `NotFoundError` (404), `IdempotencyConflictError` (409) and `ProviderPermanentError` (422) are not. The job retries only when the error is retryable and it is not the final attempt.
- **Exponential backoff with jitter.** Backoff is `base * 2^(attempt-1)`, capped at a maximum, then multiplied by a random factor (full jitter) to avoid retry storms. BullMQ is also configured with job-level exponential backoff and `attempts = TRANSACTION_MAX_ATTEMPTS`.
- **Timeouts.** Each provider call is wrapped with `TRANSACTION_TIMEOUT_MS`, so a hung provider surfaces as a retryable `TimeoutError` instead of blocking a worker slot indefinitely.

### Partial failures & consistent state

- **Audit trail.** Every transition and retry appends a row to `transaction_events` (`from_status`, `to_status`, `attempt`, `message`), giving a full, queryable history per transaction.
- **Worker safety nets.** The worker's `failed` handler enforces a terminal `failed` state once attempts are exhausted; the `stalled` handler does the same for jobs that stall in the queue. Both are no-ops if the transaction is already terminal.
- **Stalled reaper.** `StalledTransactionReaper` runs on an interval and marks any transaction stuck in `processing` beyond `STALLED_THRESHOLD_MS` as `failed`, so nothing is ever permanently stuck in a non-terminal state.
- **Always queryable.** State is written to Postgres around every transition; clients can poll `GET /api/v1/transactions/:id` (with events) at any time.

### Edge handling

- **Typed errors to HTTP.** The error middleware maps `DomainError` instances to their status code and a stable `{ error: { code, message } }` shape (details are exposed only outside production). Unknown errors become a generic 500 in production.
- **Validation at the edge.** Zod schemas validate every request body, param, and query before any use case runs.
- **No assumptions about provider payloads.** The provider response is validated with a Zod schema; an unexpected shape becomes a non-retryable `ProviderPermanentError` rather than corrupt state.

### The provider adapter

The payments rail is the `TransactionProvider` port. The current `MockTransactionProvider` deliberately models real-world failure: random latency, timeouts, 429 rate limits, transient 5xx, and permanent 4xx, all governed by the `MOCK_*` env rates and driven by an injectable RNG (so tests are deterministic). Swapping in a live rail means implementing the same port — use cases, the worker, and the reaper are untouched.

---

## 9. LLM & prompt strategy

- **Native tool calling.** The assistant uses OpenAI chat completions with `tool_choice: auto`; the model decides when to call a tool. A bounded tool-iteration loop prevents runaway tool calling.
- **Structured, validated arguments.** Tool parameters are declared as JSON Schema generated from Zod schemas, and every invocation re-validates its arguments with Zod inside the `ToolRegistry` before any effect runs.
- **Contextual, grounded responses.** Conversation history (system prompt + prior user/assistant/tool messages) is persisted in Postgres and replayed each turn, so replies are grounded in real state and the assistant never invents a transaction id or status.
- **Three tools.**

  | Tool | Kind | What it does |
  | --- | --- | --- |
  | `create_transaction` | effectful | Creates and triggers a money-movement transaction; enters the async queue path. |
  | `get_transaction_status` | read | Returns a transaction's current status and full event history by id. |
  | `list_transactions` | read | Lists recent transactions for the conversation, optionally filtered by status. |

---

## 10. Deployment

Gleni deploys as a **single Render web service** that serves both the API and the static chat UI from one origin. The Node/Express process runs the HTTP server, the BullMQ worker, and the stalled-transaction reaper in-process, and serves the sibling `frontend/` folder via `express.static`. Because the UI and API share an origin, all frontend calls are relative and there is no cross-origin/CORS surface.

```
Browser ──▶ Render (Node/Express, long-running)
              ├─ static UI: index.html, app.js, styles.css, env.js  (same origin)
              ├─ API:  /api/v1/*  +  /health
              ├─ BullMQ worker + reaper (in-process)
              ├─▶ Postgres (via DATABASE_URL)
              └─▶ Redis    (BullMQ queue)
```

### Render web service (`backend/render.yaml`)

- A single **web** service with `rootDir: backend`, built with `npm install && npm run build` and started with `npm start`. This one always-on process runs the Express server, the BullMQ worker, and the reaper in-process (as `src/index.ts` does), so no separate worker service is required. The static `frontend/` is resolved (relative to the compiled backend) and served automatically at the same origin.
- `DATABASE_URL`, `REDIS_URL`, and `OPENAI_API_KEY` are set **manually in the Render dashboard** — nothing sensitive is committed. `NODE_ENV`, `OPENAI_MODEL`, and `DATABASE_SSL` are plain values; the remaining tuning variables fall back to code defaults. `CORS_ORIGINS` is optional now that the UI is same-origin; leave it unset (the backend then allows same-origin requests) unless you additionally expose the API to another origin.
- `DATABASE_URL` must use the Supabase **session pooler** connection string (IPv4, host `...pooler.supabase.com:5432`), not the direct connection (IPv6), because Render's free tier is IPv4-only.
- `healthCheckPath` is `/health`.
- **Run the migration once** against the production `DATABASE_URL` (`npm run migration:run`) to create the schema.

> Note: on Render's free tier the service sleeps on inactivity, so the first request after idle is slow and background timers pause until it wakes.

### Frontend (served by the backend)

- No separate frontend deploy and no build step. `frontend/env.js` ships `window.GLENI_API_BASE = ""`, so the UI targets the same origin that served it and all API calls stay relative.
- To host the static UI on a different origin than the API (optional), set `window.GLENI_API_BASE` in `frontend/env.js` to the API base URL (no trailing slash) and add that UI origin to `CORS_ORIGINS` on the backend.

---

## 11. Scaling notes — at higher volume

The single-process model is intentional for the current stage. At ~100× volume, the roadmap is:

- **Split the worker from the web process** so HTTP latency and job throughput scale independently, and run multiple stateless web instances behind a load balancer alongside dedicated worker instances.
- **Connection pooling** and read replicas for status/list reads; time-based partitioning of `transactions` / `transaction_events`.
- **Queue partitioning and backpressure** — a managed queue or Redis cluster, a dead-letter queue for poison jobs, and explicit backpressure when the queue grows.
- **Provider rate-limit handling** — a shared token-bucket / concurrency limiter in front of the live rail so retries respect its 429 budget.
- **Idempotency store at the edge** — reject duplicate requests at the API gateway in addition to the database.
- **Shared rate-limit store** (Redis) instead of the in-memory store, so limits hold across instances.
- **Observability at scale** — metrics, tracing, and alerting on queue depth, retry rates, and stuck-transaction counts, plus caching (or windowed summaries) of conversation history to cut per-turn DB reads and token cost.

---

## 12. Observability

- **Structured logging.** pino emits structured JSON logs; child loggers carry per-request and per-job context.
- **Correlation IDs.** Every request gets a correlation id (generated, or accepted via the `x-correlation-id` header), attached to a child logger, echoed on the response, and propagated end-to-end — including into BullMQ job data, so worker logs correlate with the originating request.

---

## 13. Testing

The Vitest suite is deliberately reliability-focused and runs without external services (repositories, orchestrator, provider randomness, and env are injected/mocked):

- **retry** — exponential backoff math, jitter, retryable-vs-not decisions, and max-attempt exhaustion.
- **timeout** — `withTimeout` resolves/rejects correctly and surfaces timeouts.
- **domainError** — the error hierarchy: codes, status codes, `retryable` flags, and JSON shape.
- **createTransaction** — idempotency-key derivation/stability, explicit-key override, enqueue-only-on-create, and idempotent replay not double-enqueuing.
- **processTransactionJob** — terminal-state handling, retryable vs non-retryable failures, and event/status transitions.
- **mockTransactionProvider** — deterministic behavior via an injected RNG across success, timeout, 429, 5xx, and 4xx paths, plus response-shape validation.

```bash
npm test               # single run
npm run test:watch     # watch mode
npm run test:coverage  # coverage report
```

---

## 14. Known limitations & roadmap

- **Simulation-backed provider.** The payments rail is currently the `MockTransactionProvider`. Wiring a real rail is a matter of implementing the `TransactionProvider` port — no changes to use cases or the worker.
- **In-process worker.** The worker shares the web process today; separate it for production load (see [Scaling notes](#11-scaling-notes--at-higher-volume)).
- **In-memory rate-limit store.** Not shared across instances; move to Redis for multi-instance deployments.
- **No authentication.** The API is currently unauthenticated; add auth/authorization before exposing it beyond trusted operators.
- **SSE reconnection.** The stream has no automatic client reconnection/resume; a dropped connection requires a new request.
- **Single region.** No multi-region or disaster-recovery strategy is configured yet.

### Secrets handling

Gleni never hardcodes or commits secrets. Every secret (`OPENAI_API_KEY`, `DATABASE_URL`, `REDIS_URL`, …) is read only from the environment via `config/env.ts`; `.env` is gitignored and `.env.example` contains only placeholders. In production, secrets are set in the Render dashboard, not in the repository. Treat any credential that has ever appeared in a committed file or shared document as compromised and rotate it.
