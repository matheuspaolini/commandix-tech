import { expect, test } from "bun:test";

import {
  clearedRefreshCookieOptions,
  refreshCookieOptions,
} from "../src/auth/presentation/browser-auth.http";

test("HTTPS Refresh cookies retain the original remaining lifetime", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  const expiresAt = new Date("2026-09-11T12:00:00.000Z");

  expect(refreshCookieOptions(expiresAt, now, true)).toEqual({
    path: "/api/auth",
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    expires: expiresAt,
    maxAge: 86_400_000,
  });
});

test("HTTP cookie clearing uses the same scope", () => {
  expect(clearedRefreshCookieOptions(false)).toEqual({
    path: "/api/auth",
    httpOnly: true,
    sameSite: "strict",
    secure: false,
  });
});
