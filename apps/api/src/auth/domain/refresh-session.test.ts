import { expect, test } from "bun:test";

import { RefreshSession } from "./refresh-session";

test("Refresh session reuse revokes only its own session", () => {
  const session = RefreshSession.reconstitute({
    id: "session-id",
    expiresAt: new Date("2026-09-20T00:00:00.000Z"),
  });

  expect(
    session.revokeOnReuse(new Date("2026-09-11T00:00:00.000Z")),
  ).toStrictEqual({
    id: "session-id",
    revokedAt: new Date("2026-09-11T00:00:00.000Z"),
  });
});
