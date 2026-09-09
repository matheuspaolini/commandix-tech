# Commandix

A contract workspace built with a modular NestJS API, a separate NestJS worker,
React/TypeScript, PostgreSQL/Prisma, and RabbitMQ. Bun 1.4.0 runs the backend,
manages packages/workspaces, and executes tools and tests. This baseline provides a visible workspace shell,
dependency health, correlated JSON request logs, and sanitized HTTP errors.
Contract operations and authentication are introduced in later slices.

Backend TypeScript runs directly in Bun; TypeScript checks types without emitting
JavaScript, and Vite builds browser assets served by Nginx. A Node installation is
not required. Compatible `node:` standard-library imports run through Bun.

## Start the stack

Prerequisites: Docker Engine with Docker Compose 2.24.4 or newer.

```sh
cp .env.example .env
docker compose up --build -d --wait
```

Open [the workspace](http://localhost:8080) and
[RabbitMQ management](http://localhost:15672). The example broker login is
`commandix` / `local_broker_password`; these credentials are for local development.
The API is reached through the frontend origin at `/api/`:

```sh
curl -i http://localhost:8080/api/health
docker compose logs -f api worker
```

Compose creates the database roles on empty volumes, waits for PostgreSQL and
RabbitMQ health, applies versioned migrations, and runs the seed before starting
the API and idle worker. The frontend waits for API readiness. Migration and seed
containers exiting with code 0 is expected. The seed currently verifies a database
connection without adding domain data; rerunning it is safe:

```sh
docker compose run --rm seed
```

`docker compose down` preserves data. To deliberately reset this project's local
data, use `docker compose down --volumes`. Initial role passwords and broker
credentials are installed when volumes are created; changing `.env` does not rotate
existing credentials. Set unused `WEB_PORT` and `RABBITMQ_MANAGEMENT_PORT` values
if the defaults are occupied. Passwords in this local Compose setup must be
URL-safe (letters, digits, underscore). Keep real credentials out of Git.

## Database responsibilities

- `postgres` is the bootstrap administrator, used only in the database container.
- `commandix_migrator` owns the database/schema and runs Prisma migrations. It has
  no superuser, role-creation, or database-creation privileges. Only the migration
  job receives its password.
- `commandix_runtime` is used by the API, worker, and seed. It can connect and use
  the schema, with DML privileges on future domain tables, but cannot create
  schema objects, assume the migration role, or administer PostgreSQL. It receives
  no TRUNCATE grant. History-specific database protections arrive with that schema.

The baseline SQL migration installs default runtime grants without business tables.
Prisma's schema and versioned SQL migrations live in `packages/database/prisma`;
client generation and domain models arrive with persistence use cases. The current
health/seed probes use PostgreSQL's driver directly. Prisma 6 is pinned by the
lockfile; it uses the schema's `DATABASE_URL` for migration connections.

## HTTP contract

`GET /health` (browser URL `/api/health`) verifies an authenticated PostgreSQL
`SELECT 1` and an authenticated AMQP connection on every request. Both checks run
concurrently, with a hard two-second deadline per dependency and one-second
connection timeouts. The expected response budget is under three seconds including
local HTTP overhead. There is no cached success: failures return 503 and recovery
returns 200 in the same API process. Startup gating does not stop an already
running API when a dependency becomes unavailable.

```json
{ "status": "ok", "dependencies": { "database": "up", "broker": "up" } }
```

Failure uses `status: "unavailable"` and `"down"` for each failed dependency. No
connection URLs, passwords, or driver errors are returned.

Every request receives `X-Correlation-ID`. Incoming IDs are accepted only as a
36-character hexadecimal UUID in `8-4-4-4-12` form (case-insensitive, preserved
exactly). Missing, repeated, or invalid IDs are replaced with a generated UUID v4.
The response header, JSON request log, and error body use the same ID. Async request
context makes that ID available to subsequent use cases.

Global DTO validation rejects unknown properties and invalid types without implicit
scalar conversion. Errors use the following envelope, with standard HTTP status
text rather than exception messages or submitted values:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "correlationId": "ae68edcd-e14f-4e0f-8a56-0c61d91b069e"
}
```

Request logs contain only event name, correlation ID, HTTP method, matched route
pattern (or `unmatched`), status, and elapsed milliseconds. Headers, cookies,
query strings, raw paths, bodies, snapshots, exception messages, and stacks are
excluded. The reverse proxy disables access and per-request error logs because Nginx error
entries can include raw URLs and Referer headers. Dependency health exposes
availability without these details.
The validation/error demonstration routes exist exclusively in the test module;
production exposes only health in this slice.

## Develop and verify

Install Bun 1.4.0 for host commands (Docker Compose and Bash are also needed for
the stack smoke test):

```sh
bun install --frozen-lockfile
bun run format:check
bun run typecheck
bun run build
bun run test:stack
```

`test:stack` creates its own unique Compose project with empty volumes and dynamic
loopback ports. It builds/starts all services, runs formatting/type/build/HTTP checks
inside the Bun container, repeats seed, checks the browser-origin proxy, pauses
each dependency separately and together, stops both, and verifies recovery without
restarting the API. Every health assertion has a three-second timeout. It also
checks baseline role separation and that proxy failures do not log request secrets. Its exit trap removes only its own containers and
volumes. The same workflow runs in CI; no external database or broker setup is needed.

For an individual HTTP test file against existing reachable development dependencies:

```sh
export DATABASE_URL='postgresql://commandix_runtime:local_runtime_password@localhost:5432/commandix'
export RABBITMQ_URL='amqp://commandix:local_broker_password@localhost:5672'
bun run test
# Or select a test directly from TypeScript:
bun test apps/api/test/http.test.ts --test-name-pattern='invalid DTO'
```

The default Compose file keeps PostgreSQL, AMQP, and the API internal. For host
checks, `compose.test.yaml` adds dynamic database/broker ports; discover them with
`docker compose -f compose.yaml -f compose.test.yaml port postgres 5432` and
`... port rabbitmq 5672`, then substitute those ports in the URLs above. Do not
point outage checks at shared services. `bun run test` requires real dependencies
and fails if they are absent.

For frontend iteration, run `bun run --filter @commandix/web dev`; Vite proxies `/api` to a
host API on port 3000. Start that API with the dependency URLs above and
`bun run --filter @commandix/api start`. Migration commands use a migration-role
`DATABASE_URL`; `bun run db:seed` uses runtime credentials.

Workspaces own their scripts and direct dependencies. Root `typecheck`, `build`,
`test`, and database commands delegate through Bun filters; `build` checks every
workspace and builds the frontend. API/worker startup and tests need no compile step:

```sh
bun run --filter @commandix/api dev
bun run --filter @commandix/worker dev
bun run --filter @commandix/worker start
bun run --filter @commandix/database typecheck
```

Installs use the isolated linker and a single `bun.lock`. Repeated dependency
versions live in the root workspace catalog; declare dependencies in the workspace
that imports them. Use `workspace:*` when an actual cross-workspace import is
introduced; the baseline has none. Run `bun add` from the owning workspace and
commit the updated manifest and lockfile. Tool scripts force Bun even when a
dependency's executable has a Node shebang. Backend tsconfigs inherit
`Preserve`/`Bundler`, Bun types, and NestJS decorator metadata; browser checking
uses the web tsconfig.

The HTTP seam was developed with local red/green tests for health, correlation,
and DTO validation. Tests also cover unexpected exceptions, malformed JSON,
unknown fields, ID rejection, safe logs, and the absence of diagnostic production
routes. Compose smoke tests cover actual dependency failures and restoration.

## Architecture and limits

The API will own Auth, Tenant, and Contract modules, with framework-independent
domain behavior, explicit use cases, and persistence adapters. The worker will own
outbox publication and notification consumption. This slice keeps the worker idle;
no queues, consumers, business endpoints, schema, or seed users are installed yet.
Future activation delivery uses a transactional outbox, one publisher, and
idempotent notification persistence. Authentication, tenant enforcement, immutable
history, and contract screens arrive in their introducing slices. OpenTelemetry
is deferred. The Compose setup is intended for local development, not deployment
with public credentials or exposed production services.
