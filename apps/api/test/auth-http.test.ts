import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPrismaClient } from "@commandix/database";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { createApp } from "../src/app";
import { DatabaseService } from "../src/database";
import { runtimeConfigFromEnvironment } from "../src/runtime-config";
import { PrismaOnboardingRepository } from "../src/tenant/application/onboarding/onboarding.repository";

Bun.env.JWT_SECRET ??= "local_development_jwt_secret_with_32_chars";
Bun.env.AUTH_ALLOWED_ORIGINS ??= "http://localhost:8080";
Bun.env.AUTH_COOKIE_SECURE ??= "false";

const PASSWORD = "correct horse battery staple";
const ADMIN_EMAIL = "admin@example.com";
const SHARED_EMAIL = "shared@example.com";
const UNAUTHORIZED_ERROR = "Unauthorized";
const DEFAULT_ONBOARDING_INPUT = {
  email: ADMIN_EMAIL,
  password: PASSWORD,
} as const;

const client = createPrismaClient({
  datasourceUrl: Bun.env.TEST_DATABASE_URL ?? Bun.env.DATABASE_URL ?? "",
});
const createdTenantSlugs: string[] = [];
let app: INestApplication;

type Credentials = {
  email?: string;
  password?: string;
};

class FailingAdminRepository extends PrismaOnboardingRepository {
  protected override async createAdmin(
    ...args: Parameters<PrismaOnboardingRepository["createAdmin"]>
  ): ReturnType<PrismaOnboardingRepository["createAdmin"]> {
    await super.createAdmin(...args);
    throw new Error("injected Admin write failure");
  }
}

function createTenantSlug(): string {
  const uniqueId = Bun.randomUUIDv7().replaceAll("-", "");
  const tenantSlug = `test-${uniqueId}`;

  createdTenantSlugs.push(tenantSlug);
  return tenantSlug;
}

function onboard(tenantSlug: string, overrides: Credentials = {}) {
  return request(app.getHttpServer())
    .post("/onboarding")
    .send({
      slug: tenantSlug,
      email: overrides.email ?? DEFAULT_ONBOARDING_INPUT.email,
      password: overrides.password ?? DEFAULT_ONBOARDING_INPUT.password,
    });
}

function signIn(tenantSlug: string, overrides: Credentials = {}) {
  return request(app.getHttpServer())
    .post("/auth/sign-in")
    .send({
      slug: tenantSlug,
      email: overrides.email ?? ADMIN_EMAIL,
      password: overrides.password ?? PASSWORD,
    });
}

function authenticatedIdentity(accessToken: string) {
  return request(app.getHttpServer())
    .get("/auth/identity?tenantId=other&role=MEMBER")
    .set("Authorization", `Bearer ${accessToken}`)
    .set("x-tenant-id", "other")
    .set("x-role", "MEMBER");
}

function unauthorizedResult(response: { status: number; body: unknown }) {
  const body = response.body as { error?: unknown };
  return { status: response.status, error: body.error };
}

async function countPersistedIdentity(tenantSlug: string) {
  const tenant = await client.tenant.findUnique({
    where: { slug: tenantSlug },
  });

  return {
    tenants: tenant ? 1 : 0,
    users: tenant
      ? await client.user.count({ where: { tenantId: tenant.id } })
      : 0,
  };
}

async function deleteTenantIfPresent(tenantSlug: string): Promise<void> {
  const tenant = await client.tenant.findUnique({
    where: { slug: tenantSlug },
  });
  if (!tenant) return;

  const users = await client.user.findMany({
    where: { tenantId: tenant.id },
    select: { id: true },
  });
  await client.refreshCredential.deleteMany({
    where: { session: { userId: { in: users.map((user) => user.id) } } },
  });
  await client.refreshSession.deleteMany({
    where: { userId: { in: users.map((user) => user.id) } },
  });
  await client.user.deleteMany({ where: { tenantId: tenant.id } });
  await client.tenant.delete({ where: { id: tenant.id } });
}

async function createAuthenticationScenario() {
  const tenantSlug = createTenantSlug();
  const onboarding = await onboard(` ${tenantSlug.toUpperCase()} `, {
    email: " ADMIN@Example.COM ",
  });
  const persistedCounts = await countPersistedIdentity(tenantSlug);
  const storedUser = await client.user.findUnique({
    where: { id: onboarding.body.user.id },
  });

  if (!storedUser) {
    throw new Error("Expected onboarding to persist an Admin user");
  }

  let slugUpdate: "resolved" | "rejected" = "resolved";
  try {
    await client.tenant.update({
      where: { id: onboarding.body.tenant.id },
      data: { slug: "attempted-mutation" },
    });
  } catch {
    slugUpdate = "rejected";
  }

  const persistedTenant = await client.tenant.findUnique({
    where: { id: onboarding.body.tenant.id },
  });
  const authentication = await signIn(tenantSlug);
  const identityResponse = await authenticatedIdentity(
    authentication.body.accessToken,
  );

  return {
    tenantSlug,
    onboarding,
    persistedCounts,
    storedUser,
    slugUpdate,
    persistedSlug: persistedTenant?.slug,
    signIn: authentication,
    identity: {
      status: identityResponse.status,
      body: identityResponse.body,
    },
  };
}

async function createSharedEmailScenario() {
  const tenantSlugs = [createTenantSlug(), createTenantSlug()];
  const onboardingStatuses: number[] = [];
  const signInStatuses: number[] = [];

  for (const tenantSlug of tenantSlugs) {
    const response = await onboard(tenantSlug, { email: SHARED_EMAIL });
    onboardingStatuses.push(response.status);
  }

  for (const tenantSlug of tenantSlugs) {
    const response = await signIn(tenantSlug, { email: SHARED_EMAIL });
    signInStatuses.push(response.status);
  }

  return { onboardingStatuses, signInStatuses };
}

async function createConcurrentOnboardingScenario() {
  const tenantSlug = createTenantSlug();
  const responses = await Promise.all(
    ["one@example.com", "two@example.com"].map((email) =>
      onboard(tenantSlug, { email }),
    ),
  );

  return {
    statuses: responses.map((response) => response.status),
    persistedCounts: await countPersistedIdentity(tenantSlug),
  };
}

async function createRollbackScenario() {
  const tenantSlug = createTenantSlug();
  const database = new DatabaseService(runtimeConfigFromEnvironment());
  const repository = new FailingAdminRepository(database);
  let rejected = false;

  try {
    await repository.createTenantAndAdmin(
      { slug: tenantSlug, email: ADMIN_EMAIL },
      "not-a-real-hash",
    );
  } catch {
    rejected = true;
  } finally {
    await database.onModuleDestroy();
  }

  return {
    rejected,
    persistedCounts: await countPersistedIdentity(tenantSlug),
  };
}

type AuthenticationScenario = Awaited<
  ReturnType<typeof createAuthenticationScenario>
>;
type SharedEmailScenario = Awaited<
  ReturnType<typeof createSharedEmailScenario>
>;
type ConcurrentOnboardingScenario = Awaited<
  ReturnType<typeof createConcurrentOnboardingScenario>
>;
type RollbackScenario = Awaited<ReturnType<typeof createRollbackScenario>>;

beforeAll(async () => {
  app = await createApp();
  await app.init();
});

afterAll(async () => {
  for (const tenantSlug of createdTenantSlugs) {
    await deleteTenantIfPresent(tenantSlug);
  }

  await Promise.all([app?.close(), client.$disconnect()]);
});

describe("tenant-scoped authentication lifecycle", () => {
  let scenario: AuthenticationScenario;

  beforeAll(async () => {
    scenario = await createAuthenticationScenario();
  });

  test("onboarding succeeds", () => {
    expect(scenario.onboarding.status).toBe(201);
  });

  test("onboarding returns the canonical tenant slug", () => {
    expect(scenario.onboarding.body.tenant.slug).toBe(scenario.tenantSlug);
  });

  test("onboarding returns the canonical Admin identity", () => {
    expect(scenario.onboarding.body.user).toMatchObject({
      email: ADMIN_EMAIL,
      role: "ADMIN",
    });
  });

  test("onboarding persists one tenant and one user", () => {
    expect(scenario.persistedCounts).toStrictEqual({ tenants: 1, users: 1 });
  });

  test("the stored password is not plaintext", () => {
    expect(scenario.storedUser.passwordHash).not.toBe(PASSWORD);
  });

  test("the stored password uses Argon2id", () => {
    expect(scenario.storedUser.passwordHash).toMatch(/^\$argon2id\$/);
  });

  test("the immutable tenant slug rejects updates", () => {
    expect(scenario.slugUpdate).toBe("rejected");
  });

  test("the rejected update preserves the tenant slug", () => {
    expect(scenario.persistedSlug).toBe(scenario.tenantSlug);
  });

  test("sign-in succeeds", () => {
    expect(scenario.signIn.status).toBe(200);
  });

  test("sign-in returns an access token", () => {
    expect(scenario.signIn.body.accessToken).toBeString();
  });

  test("verified identity ignores spoofed tenant and role inputs", () => {
    expect(scenario.identity).toStrictEqual({
      status: 200,
      body: {
        user: {
          id: scenario.onboarding.body.user.id,
          email: ADMIN_EMAIL,
        },
        tenant: {
          id: scenario.onboarding.body.tenant.id,
          slug: scenario.tenantSlug,
        },
        role: "ADMIN",
      },
    });
  });
});

describe("same email across tenants", () => {
  let scenario: SharedEmailScenario;

  beforeAll(async () => {
    scenario = await createSharedEmailScenario();
  });

  test("creates the identity in both tenants", () => {
    expect(scenario.onboardingStatuses.sort()).toStrictEqual([201, 201]);
  });

  test("authenticates the identity in both tenants", () => {
    expect(scenario.signInStatuses.sort()).toStrictEqual([200, 200]);
  });
});

describe("nondisclosing authentication failures", () => {
  let tenantSlug: string;

  beforeAll(async () => {
    tenantSlug = createTenantSlug();
    await onboard(tenantSlug);
  });

  const failureCases = [
    {
      name: "an unknown tenant",
      input: () => ({
        tenantSlug: "unknown-tenant",
        email: ADMIN_EMAIL,
        password: PASSWORD,
      }),
    },
    {
      name: "an unknown email",
      input: () => ({
        tenantSlug,
        email: "missing@example.com",
        password: PASSWORD,
      }),
    },
    {
      name: "an incorrect password",
      input: () => ({
        tenantSlug,
        email: ADMIN_EMAIL,
        password: "wrong password",
      }),
    },
  ];

  for (const failureCase of failureCases) {
    test(`does not disclose details for ${failureCase.name}`, async () => {
      const input = failureCase.input();
      const response = await signIn(input.tenantSlug, {
        email: input.email,
        password: input.password,
      });

      expect(unauthorizedResult(response)).toStrictEqual({
        status: 401,
        error: UNAUTHORIZED_ERROR,
      });
    });
  }

  test("rejects a malformed access token", async () => {
    const response = await request(app.getHttpServer())
      .get("/auth/identity")
      .set("Authorization", "Bearer invalid.token.value");

    expect(response.status).toBe(401);
  });
});

describe("concurrent onboarding", () => {
  let scenario: ConcurrentOnboardingScenario;

  beforeAll(async () => {
    scenario = await createConcurrentOnboardingScenario();
  });

  test("allows one request and rejects the duplicate", () => {
    expect(scenario.statuses.sort()).toStrictEqual([201, 409]);
  });

  test("persists only one tenant and one Admin", () => {
    expect(scenario.persistedCounts).toStrictEqual({ tenants: 1, users: 1 });
  });
});

describe("onboarding transaction rollback", () => {
  let scenario: RollbackScenario;

  beforeAll(async () => {
    scenario = await createRollbackScenario();
  });

  test("propagates the injected Admin-write failure", () => {
    expect(scenario.rejected).toBe(true);
  });

  test("rolls back both tenant and Admin writes", () => {
    expect(scenario.persistedCounts).toStrictEqual({ tenants: 0, users: 0 });
  });
});
