# Commandix

A contract workspace built with a modular NestJS API, a separate NestJS worker,
React/TypeScript, PostgreSQL/Prisma, and RabbitMQ. Bun 1.4.0 runs the backend,
manages packages/workspaces, and executes tools and tests. This baseline provides a visible workspace shell,
dependency health, correlated JSON request logs, sanitized HTTP errors, and
tenant-scoped Admin authentication. Contract operations are introduced in later slices.

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
[RabbitMQ management](http://localhost:15672). The example broker sign-in is
`commandix` / `local_broker_password`; these credentials are for local development.
The API is reached through the frontend origin at `/api/`:

```sh
curl -i http://localhost:8080/api/health
docker compose logs -f api worker
```

Compose creates the database roles on empty volumes, waits for PostgreSQL and
RabbitMQ health, applies versioned migrations, and runs the seed before starting
the API and idle worker. The frontend waits for API readiness. Migration and seed
containers exiting with code 0 is expected. The seed creates two development
Tenant workspaces and is safe to rerun without overwriting existing records:

```sh
docker compose run --rm seed
```

Development-only credentials use the shared password `Commandix-demo-2026!`:

| Tenant   | Admin               | Member               |
| -------- | ------------------- | -------------------- |
| `acme`   | `admin@acme.test`   | `member@acme.test`   |
| `globex` | `admin@globex.test` | `member@globex.test` |

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

## Onboarding and authentication

Onboarding is API-only in this slice. It atomically creates one Tenant and its
initial Admin; it does not sign that Admin in:

```sh
curl -i http://localhost:8080/api/onboarding \
  -H 'content-type: application/json' \
  --data '{"slug":"acme-north","email":"admin@example.com","password":"correct horse battery staple"}'
```

Slug and email are trimmed and lowercased. Slugs must be 3–63 lowercase
alphanumeric/hyphen characters without leading, trailing, or repeated hyphens.
Emails use standard email validation after canonicalization. Passwords are kept
exactly as entered, must contain 12–128 Unicode code points, and cannot be only
whitespace. Duplicate canonical slugs return `409`; malformed input returns `400`.

Sign in with the same three fields to receive a 15-minute access token and a
host-only, HttpOnly Refresh cookie:

```sh
token=$(curl -s -c cookies.txt -b cookies.txt http://localhost:8080/api/auth/sign-in \
  -H 'content-type: application/json' \
  --data '{"slug":"acme-north","email":"admin@example.com","password":"correct horse battery staple"}' \
  | bun -e 'console.log((await Bun.stdin.json()).accessToken)')
curl -i http://localhost:8080/api/auth/identity -H "authorization: Bearer $token"
curl -i -c cookies.txt -b cookies.txt -X POST http://localhost:8080/api/auth/refresh
curl -i -c cookies.txt -b cookies.txt -X DELETE http://localhost:8080/api/auth/sign-out
```

All unknown-tenant, unknown-email, and wrong-password attempts return the same
`401` response. Access tokens expire after 15 minutes and remain in browser memory
only. Each sign-in creates an independent Refresh session with a fixed seven-day
deadline. Refresh credentials rotate after use; verified reuse revokes that whole
session and its descendants without affecting another sign-in. Sign-out revokes
the identifiable Refresh session and clears its cookie while already-issued access
tokens expire naturally.

The cookie is `HttpOnly`, `SameSite=Strict`, host-only, and scoped to `/api/auth`.
`AUTH_ALLOWED_ORIGINS` lists exact browser origins allowed to call sign-in, refresh,
and sign-out; requests without Origin remain usable by command-line clients.
`AUTH_COOKIE_SECURE=false` supports documented HTTP development. Set it to `true`
with an explicit HTTPS origin for deployment. Expired Refresh-session rows are
retained in this slice; bounded cleanup is future work. Never record live access
tokens, Refresh credentials, cookies, hashes, or cookie-jar files in logs or Git.
`JWT_SECRET` must contain at least 32 characters.

Both Admins and Members can read their Tenant's active immutable Template version.
A Tenant without an active Template receives `404`; tenant scope always comes from
the verified access token:

```sh
token=$(curl -s -c cookies.txt http://localhost:8080/api/auth/sign-in \
  -H 'content-type: application/json' \
  --data '{"slug":"acme","email":"admin@acme.test","password":"Commandix-demo-2026!"}' \
  | bun -e 'console.log((await Bun.stdin.json()).accessToken)')
curl -i http://localhost:8080/api/templates/active \
  -H "authorization: Bearer $token"
```

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
export JWT_SECRET='local_development_jwt_secret_32_chars'
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

The API owns Auth, Tenant, and Contract modules with framework-independent
normalization, password, token, onboarding, Template validation, and persistence
seams. The worker remains idle; no queues, consumers, or Contract mutation
endpoints are installed yet. Future
activation delivery uses a transactional outbox, one publisher, and idempotent
notification persistence. Contract screens, immutable history, and tenant
enforcement for later domain resources arrive in their introducing slices.
OpenTelemetry is deferred. The Compose setup is intended for local
development, not deployment with public credentials or exposed production services.
