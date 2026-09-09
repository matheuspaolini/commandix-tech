import assert from "node:assert/strict";

const [status, database, broker, url = "http://127.0.0.1:3000/health"] =
  process.argv.slice(2);
const start = performance.now();
const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
assert.equal(response.status, status === "ok" ? 200 : 503);
assert.deepEqual(await response.json(), {
  status,
  dependencies: { database, broker },
});
assert.match(response.headers.get("x-correlation-id") ?? "", /^[0-9a-f-]{36}$/);
assert.ok(
  performance.now() - start < 3000,
  "health must return within three seconds",
);
console.log(
  `health: ${database}/${broker}, ${Math.round(performance.now() - start)}ms`,
);
