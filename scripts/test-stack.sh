#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Unique project and dynamic loopback ports ensure existing development data is untouched.
project="commandix-smoke-$(date +%s)-$$"
compose=(docker compose --env-file .env.example -p "$project" -f compose.yaml -f compose.test.yaml)
cleanup() {
  "${compose[@]}" unpause postgres rabbitmq >/dev/null 2>&1 || true
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"${compose[@]}" up -d --build --wait --wait-timeout 180
"${compose[@]}" exec -T api bun -e 'import assert from "node:assert/strict"; import { realpathSync } from "node:fs"; assert.equal(Bun.version, "1.4.0"); const node = Bun.which("node"); if (node) assert.equal(realpathSync(node), realpathSync(process.execPath), "node must only be a Bun shim"); assert.notEqual(process.getuid(), 0); console.log("Bun 1.4.0, no Node installation, non-root runtime verified");'
"${compose[@]}" exec -T api bun run check
"${compose[@]}" exec -T api bun scripts/assert-seeded-workspaces.mjs
"${compose[@]}" exec -T postgres psql -U postgres -d commandix -v ON_ERROR_STOP=1 <<'SQL'
UPDATE users
SET password_hash = 'preserved-seed-edit'
WHERE email = 'member@globex.test'
  AND tenant_id = (SELECT id FROM tenants WHERE slug = 'globex');
INSERT INTO tenants (slug) VALUES ('unrelated-seed-data');
SQL
"${compose[@]}" run --rm --no-deps seed
"${compose[@]}" exec -T postgres psql -U postgres -d commandix -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF (SELECT count(*) FROM tenants) <> 3
    OR (SELECT count(*) FROM users) <> 4
    OR (SELECT count(*) FROM logical_templates) <> 2
    OR (SELECT count(*) FROM template_versions) <> 2
    OR (SELECT password_hash FROM users WHERE email = 'member@globex.test') <> 'preserved-seed-edit' THEN
    RAISE EXCEPTION 'Repeat seed changed existing data or duplicated records';
  END IF;
END $$;
DELETE FROM tenants WHERE slug = 'unrelated-seed-data';
SQL
"${compose[@]}" exec -T api bun scripts/assert-health.mjs ok up up
web_address=$("${compose[@]}" port web 80)
bun scripts/assert-health.mjs ok up up "http://$web_address/api/health"
bun - "$web_address" <<'JS'
import assert from 'node:assert/strict';
const response = await fetch(`http://${process.argv[2]}`);
assert.equal(response.status, 200);
const html = await response.text();
assert.match(html, /<title>Commandix/);
const asset = html.match(/src="([^"]+\.js)"/)[1];
assert.equal((await fetch(`http://${process.argv[2]}${asset}`)).status, 200);
JS
# Pause simulates dependencies that accept TCP but never answer, exercising deadlines.
"${compose[@]}" pause postgres
"${compose[@]}" exec -T api bun scripts/assert-health.mjs unavailable down up
"${compose[@]}" pause rabbitmq
"${compose[@]}" exec -T api bun scripts/assert-health.mjs unavailable down down
"${compose[@]}" unpause postgres
"${compose[@]}" exec -T api bun scripts/assert-health.mjs unavailable up down
"${compose[@]}" unpause rabbitmq
"${compose[@]}" exec -T api bun scripts/assert-health.mjs ok up up
# Also cover immediate connection failures and recovery in the same API process.
"${compose[@]}" stop postgres rabbitmq
"${compose[@]}" exec -T api bun scripts/assert-health.mjs unavailable down down
"${compose[@]}" start --wait postgres rabbitmq
"${compose[@]}" exec -T api bun scripts/assert-health.mjs ok up up
"${compose[@]}" exec -T postgres psql -U postgres -d commandix -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commandix_runtime' AND (rolsuper OR rolcreatedb OR rolcreaterole))
    OR pg_has_role('commandix_runtime', 'commandix_migrator', 'MEMBER')
    OR has_schema_privilege('commandix_runtime', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Runtime credentials must not own or administer the schema';
  END IF;
END $$;
SQL
# Proxy errors must not disclose the raw URI when the API is unavailable.
"${compose[@]}" stop api
bun - "$web_address" <<'JS'
import assert from 'node:assert/strict';
const response = await fetch(`http://${process.argv[2]}/api/health?token=proxy-secret-sentinel`, {
  signal: AbortSignal.timeout(3000),
  headers: { Referer: 'https://example.test/proxy-secret-sentinel' },
});
assert.ok([502, 504].includes(response.status), "unavailable upstream must return a gateway error");
assert.doesNotMatch(await response.text(), /proxy-secret-sentinel/);
JS
"${compose[@]}" logs --no-log-prefix web 2>&1 | bun -e '
import assert from "node:assert/strict";
let logs = "";
for await (const chunk of process.stdin) logs += chunk;
assert.doesNotMatch(logs, /proxy-secret-sentinel/);
'
"${compose[@]}" start --wait api
"${compose[@]}" logs --no-log-prefix api worker
"${compose[@]}" stop -t 10 api worker
for service in api worker; do
  container_id=$("${compose[@]}" ps -a -q "$service")
  exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$container_id")
  if [[ "$exit_code" != 0 && "$exit_code" != 143 ]]; then
    printf '%s failed graceful shutdown: exit %s\n' "$service" "$exit_code" >&2
    exit 1
  fi
done
"${compose[@]}" logs --no-log-prefix worker | bun -e 'import assert from "node:assert/strict"; assert.match(await Bun.stdin.text(), /"event":"worker_stopped"/);'
printf 'Fresh-volume stack, checks, outages, and recovery passed.\n'
