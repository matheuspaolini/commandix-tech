import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPrismaClient } from "@commandix/database";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { createApiModule, createApp } from "@/bootstrap/app";
import { runtimeConfigFromEnvironment } from "@/platform/runtime-config";

Bun.env.JWT_SECRET ??= "local_development_jwt_secret_with_32_chars";
Bun.env.AUTH_ALLOWED_ORIGINS ??= "http://localhost:8080";
Bun.env.AUTH_COOKIE_SECURE ??= "false";

const client = createPrismaClient({
  datasourceUrl: Bun.env.TEST_DATABASE_URL ?? Bun.env.DATABASE_URL ?? "",
});
const slug = `refresh-${Bun.randomUUIDv7().replaceAll("-", "")}`;
const credentials = {
  slug,
  email: "admin@example.com",
  password: "correct horse battery staple",
};
let app: INestApplication;

function cookiePair(response: request.Response): string {
  const header = response.headers["set-cookie"];
  const cookie = Array.isArray(header) ? header[0] : header;
  if (!cookie) throw new Error("Expected a refresh cookie");
  return cookie.split(";", 1)[0]!;
}

function signIn(origin?: string) {
  const pending = request(app.getHttpServer())
    .post("/auth/sign-in")
    .send(credentials);
  return origin ? pending.set("Origin", origin) : pending;
}

function refresh(cookie: string) {
  return request(app.getHttpServer())
    .post("/auth/refresh")
    .set("Cookie", cookie);
}

beforeAll(async () => {
  app = await createApp({
    rootModule: createApiModule(runtimeConfigFromEnvironment()),
    writeLog: () => {},
  });
  await app.init();
  await request(app.getHttpServer()).post("/onboarding").send(credentials);
});

afterAll(async () => {
  const tenant = await client.tenant.findUnique({ where: { slug } });
  if (tenant) {
    const users = await client.user.findMany({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await client.refreshCredential.deleteMany({
      where: { session: { userId: { in: userIds } } },
    });
    await client.refreshSession.deleteMany({
      where: { userId: { in: userIds } },
    });
    await client.user.deleteMany({ where: { tenantId: tenant.id } });
    await client.tenant.delete({ where: { id: tenant.id } });
  }
  await Promise.all([app.close(), client.$disconnect()]);
});

describe("Refresh session HTTP lifecycle", () => {
  test("sign-in sets the scoped HttpOnly cookie", async () => {
    const response = await signIn();
    const cookie = response.headers["set-cookie"]?.toString() ?? "";

    expect({ status: response.status, cookie }).toEqual({
      status: 200,
      cookie: expect.stringMatching(
        /commandix_refresh=.*Path=\/api\/auth.*HttpOnly.*SameSite=Strict/,
      ),
    });
  });

  test("the replaced sign-in route is absent", async () => {
    const response = await request(app.getHttpServer())
      .post(`/auth/${["log", "in"].join("")}`)
      .send(credentials);

    expect(response.status).toBe(404);
  });

  test("an allowed Origin can create a Refresh session", async () => {
    const response = await signIn("http://localhost:8080");

    expect(response.status).toBe(200);
  });

  test("rotation and verified reuse revoke the descendant but not another session", async () => {
    const first = await signIn();
    const independent = await signIn();
    const originalCookie = cookiePair(first);
    const rotated = await refresh(originalCookie);
    const descendantCookie = cookiePair(rotated);
    const reuse = await refresh(originalCookie);
    const descendant = await refresh(descendantCookie);
    const independentResult = await refresh(cookiePair(independent));

    expect({
      rotated: rotated.status,
      reuse: reuse.status,
      descendant: descendant.status,
      independent: independentResult.status,
    }).toEqual({ rotated: 200, reuse: 401, descendant: 401, independent: 200 });
  });

  test("competing refreshes have one winner whose descendant is revoked", async () => {
    const signedIn = await signIn();
    const originalCookie = cookiePair(signedIn);
    const competitors = await Promise.all([
      refresh(originalCookie),
      refresh(originalCookie),
    ]);
    const winner = competitors.find((response) => response.status === 200);
    if (!winner) throw new Error("Expected one rotation winner");
    const descendant = await refresh(cookiePair(winner));

    expect({
      statuses: competitors.map((response) => response.status).sort(),
      descendant: descendant.status,
    }).toEqual({ statuses: [200, 401], descendant: 401 });
  });

  test("a wrong secret cannot revoke the selected Refresh session", async () => {
    const signedIn = await signIn();
    const cookie = cookiePair(signedIn);
    const [name, value] = cookie.split("=");
    const [selector] = value!.split(".");
    const invalid = await refresh(`${name}=${selector}.${"A".repeat(43)}`);
    const valid = await refresh(cookie);

    expect({ invalid: invalid.status, valid: valid.status }).toEqual({
      invalid: 401,
      valid: 200,
    });
  });

  test("expiry at the boundary rejects refresh", async () => {
    const signedIn = await signIn();
    const cookie = cookiePair(signedIn);
    const selector = cookie.split("=", 2)[1]!.split(".", 1)[0]!;
    const credential = await client.refreshCredential.findUnique({
      where: { selector },
    });
    if (!credential) throw new Error("Expected a stored credential");
    const deadline = new Date(Math.floor(Date.now() / 1_000) * 1_000);
    await client.refreshSession.update({
      where: { id: credential.sessionId },
      data: {
        createdAt: new Date(deadline.getTime() - 1_000),
        expiresAt: deadline,
      },
    });

    const response = await refresh(cookie);

    expect(response.status).toBe(401);
  });

  test("persistence contains no complete Refresh credential", async () => {
    const signedIn = await signIn();
    const serialized = cookiePair(signedIn).split("=", 2)[1]!;
    const persisted = await client.refreshCredential.findMany({
      where: { session: { user: { tenant: { slug } } } },
      select: { secretHash: true },
    });

    expect({
      hasHash: persisted.every(
        (credential) => credential.secretHash.length > 0,
      ),
      containsCredential: JSON.stringify(persisted).includes(serialized),
    }).toEqual({ hasHash: true, containsCredential: false });
  });

  test("sign-out is idempotent and does not invalidate an issued access token", async () => {
    const signedIn = await signIn();
    const cookie = cookiePair(signedIn);
    const first = await request(app.getHttpServer())
      .delete("/auth/sign-out")
      .set("Cookie", cookie);
    const repeated = await request(app.getHttpServer())
      .delete("/auth/sign-out")
      .set("Cookie", cookie);
    const identity = await request(app.getHttpServer())
      .get("/auth/identity")
      .set("Authorization", `Bearer ${signedIn.body.accessToken}`);

    expect({
      first: first.status,
      repeated: repeated.status,
      identity: identity.status,
      clearingCookie: first.headers["set-cookie"]?.toString(),
    }).toEqual({
      first: 204,
      repeated: 204,
      identity: 200,
      clearingCookie: expect.stringMatching(
        /commandix_refresh=;.*Path=\/api\/auth.*HttpOnly.*SameSite=Strict/,
      ),
    });
  });

  test("a denied Origin prevents sign-in and cookie creation", async () => {
    const before = await client.refreshSession.count();
    const response = await signIn("https://attacker.example");
    const after = await client.refreshSession.count();

    expect({
      status: response.status,
      cookie: response.headers["set-cookie"],
      sessionDelta: after - before,
    }).toEqual({ status: 403, cookie: undefined, sessionDelta: 0 });
  });

  test("invalid refresh is nondisclosing and clears its cookie", async () => {
    const response = await refresh("commandix_refresh=malformed");

    expect({
      status: response.status,
      error: response.body.error,
      clearingCookie: response.headers["set-cookie"]?.toString(),
    }).toEqual({
      status: 401,
      error: "Unauthorized",
      clearingCookie: expect.stringMatching(
        /commandix_refresh=;.*Path=\/api\/auth.*HttpOnly.*SameSite=Strict/,
      ),
    });
  });
});
