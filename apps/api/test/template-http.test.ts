import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPrismaClient } from "@commandix/database";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { createApp } from "../src/app";

Bun.env.JWT_SECRET ??= "local_development_jwt_secret_with_32_chars";
Bun.env.AUTH_ALLOWED_ORIGINS ??= "http://localhost:8080";
Bun.env.AUTH_COOKIE_SECURE ??= "false";

const DEVELOPMENT_PASSWORD = "Commandix-demo-2026!";
const client = createPrismaClient();
const accessTokens = new Map<string, string>();
const refreshCookies: string[] = [];
let app: INestApplication;
let untemplatedTenantSlug: string;

function signIn(slug: string, email: string) {
  return request(app.getHttpServer()).post("/auth/sign-in").send({
    slug,
    email,
    password: DEVELOPMENT_PASSWORD,
  });
}

function activeTemplate(accessToken: string, query = "") {
  return request(app.getHttpServer())
    .get(`/templates/active${query}`)
    .set("Authorization", `Bearer ${accessToken}`);
}

beforeAll(async () => {
  app = await createApp();
  await app.init();

  for (const slug of ["acme", "globex"] as const) {
    for (const role of ["admin", "member"] as const) {
      const response = await signIn(slug, `${role}@${slug}.test`);
      if (typeof response.body.accessToken !== "string")
        throw new Error(`Expected seeded ${slug} ${role} to authenticate`);
      accessTokens.set(`${slug}:${role}`, response.body.accessToken);
      if (response.headers["set-cookie"]?.[0])
        refreshCookies.push(response.headers["set-cookie"][0]);
    }
  }

  untemplatedTenantSlug = `untemplated-${Bun.randomUUIDv7().replaceAll("-", "")}`;
  await request(app.getHttpServer()).post("/onboarding").send({
    slug: untemplatedTenantSlug,
    email: "admin@example.com",
    password: DEVELOPMENT_PASSWORD,
  });
  const authentication = await signIn(
    untemplatedTenantSlug,
    "admin@example.com",
  );
  accessTokens.set("untemplated:admin", authentication.body.accessToken);
});

afterAll(async () => {
  for (const cookie of refreshCookies) {
    await request(app.getHttpServer())
      .delete("/auth/sign-out")
      .set("Cookie", cookie);
  }
  const tenant = await client.tenant.findUnique({
    where: { slug: untemplatedTenantSlug },
    include: { users: { select: { id: true } } },
  });
  if (tenant) {
    const userIds = tenant.users.map((user) => user.id);
    await client.refreshCredential.deleteMany({
      where: { session: { userId: { in: userIds } } },
    });
    await client.refreshSession.deleteMany({
      where: { userId: { in: userIds } },
    });
    await client.user.deleteMany({ where: { tenantId: tenant.id } });
    await client.tenant.delete({ where: { id: tenant.id } });
  }
  await Promise.all([app?.close(), client.$disconnect()]);
});

describe("active template reading", () => {
  test("allows both roles to read the same tenant definition", async () => {
    const admin = await activeTemplate(accessTokens.get("acme:admin")!);
    const member = await activeTemplate(accessTokens.get("acme:member")!);

    expect({ admin: admin.body, member: member.body }).toStrictEqual({
      admin: member.body,
      member: member.body,
    });
  });

  test("keeps different tenants on different version identities", async () => {
    const acme = await activeTemplate(accessTokens.get("acme:admin")!);
    const globex = await activeTemplate(accessTokens.get("globex:admin")!);

    expect({
      status: [acme.status, globex.status],
      distinctLogicalTemplates:
        acme.body.logicalTemplateId !== globex.body.logicalTemplateId,
      distinctVersions:
        acme.body.templateVersionId !== globex.body.templateVersionId,
    }).toStrictEqual({
      status: [200, 200],
      distinctLogicalTemplates: true,
      distinctVersions: true,
    });
  });

  test("ignores a caller-supplied tenant selector", async () => {
    const expected = await activeTemplate(accessTokens.get("acme:admin")!);
    const spoofed = await activeTemplate(
      accessTokens.get("acme:admin")!,
      "?tenantId=globex",
    );

    expect({ status: spoofed.status, body: spoofed.body }).toStrictEqual({
      status: 200,
      body: expected.body,
    });
  });

  test("returns absence for a tenant without a template", async () => {
    const response = await activeTemplate(
      accessTokens.get("untemplated:admin")!,
    );

    expect({
      status: response.status,
      error: response.body.error,
    }).toStrictEqual({ status: 404, error: "Not Found" });
  });

  test("requires authentication", async () => {
    const response = await request(app.getHttpServer()).get(
      "/templates/active",
    );

    expect({
      status: response.status,
      error: response.body.error,
    }).toStrictEqual({ status: 401, error: "Unauthorized" });
  });
});
