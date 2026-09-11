import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPrismaClient, PrismaClient } from "@commandix/database";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { createApp } from "@/app";

Bun.env.JWT_SECRET ??= "local_development_jwt_secret_with_32_chars";
Bun.env.AUTH_ALLOWED_ORIGINS ??= "http://localhost:8080";
Bun.env.AUTH_COOKIE_SECURE ??= "false";

const DEVELOPMENT_PASSWORD = "Commandix-demo-2026!";
const client = createPrismaClient({
  datasourceUrl: Bun.env.TEST_DATABASE_URL ?? Bun.env.DATABASE_URL ?? "",
});
const cleanupClient = Bun.env.TEST_DATABASE_URL
  ? new PrismaClient({ datasourceUrl: Bun.env.TEST_DATABASE_URL })
  : null;
const accessTokens = new Map<string, string>();
const refreshCookies: string[] = [];
let app: INestApplication;
let untemplatedTenantSlug: string;
let publicationTenantSlug: string;

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

function putActiveTemplate(
  accessToken: string,
  expectedRevision: unknown,
  definition: unknown,
) {
  return request(app.getHttpServer())
    .put("/templates/active")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ expectedRevision, definition });
}

function createContract(accessToken: string, values: unknown) {
  return request(app.getHttpServer())
    .post("/contracts")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ values });
}

function contractDetail(accessToken: string, contractId: string) {
  return request(app.getHttpServer())
    .get(`/contracts/${contractId}`)
    .set("Authorization", `Bearer ${accessToken}`);
}

function contractHistory(accessToken: string, contractId: string) {
  return request(app.getHttpServer())
    .get(`/contracts/${contractId}/history`)
    .set("Authorization", `Bearer ${accessToken}`);
}

async function onboardTenant(key: string) {
  const slug = `${key}-${Bun.randomUUIDv7().replaceAll("-", "")}`;
  await request(app.getHttpServer()).post("/onboarding").send({
    slug,
    email: "admin@example.com",
    password: DEVELOPMENT_PASSWORD,
  });
  const authentication = await signIn(slug, "admin@example.com");
  accessTokens.set(`${key}:admin`, authentication.body.accessToken);
  return slug;
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

  untemplatedTenantSlug = await onboardTenant("untemplated");
  publicationTenantSlug = await onboardTenant("publication");
});

afterAll(async () => {
  for (const cookie of refreshCookies) {
    await request(app.getHttpServer())
      .delete("/auth/sign-out")
      .set("Cookie", cookie);
  }
  const tenantSlugs = [untemplatedTenantSlug, publicationTenantSlug].filter(
    (slug): slug is string => typeof slug === "string",
  );
  const tenants = await client.tenant.findMany({
    where: { slug: { in: tenantSlugs } },
    include: { users: { select: { id: true } } },
  });
  for (const tenant of tenants) {
    const userIds = tenant.users.map(({ id }) => id);
    if (tenant.slug === publicationTenantSlug) {
      if (!cleanupClient) throw new Error("Missing TEST_DATABASE_URL");
      await cleanupClient.$executeRawUnsafe(
        'ALTER TABLE "contract_history" DISABLE TRIGGER contract_history_rows_immutable',
      );
      try {
        await cleanupClient.contractHistory.deleteMany({
          where: { tenantId: tenant.id },
        });
      } finally {
        await cleanupClient.$executeRawUnsafe(
          'ALTER TABLE "contract_history" ENABLE TRIGGER contract_history_rows_immutable',
        );
      }
      await cleanupClient.contract.deleteMany({
        where: { tenantId: tenant.id },
      });
      await cleanupClient.logicalTemplate.updateMany({
        where: { tenantId: tenant.id },
        data: { activeVersionId: null },
      });
      await cleanupClient.$executeRawUnsafe(
        'ALTER TABLE "template_versions" DISABLE TRIGGER template_versions_immutable',
      );
      try {
        await cleanupClient.templateVersion.deleteMany({
          where: { tenantId: tenant.id },
        });
      } finally {
        await cleanupClient.$executeRawUnsafe(
          'ALTER TABLE "template_versions" ENABLE TRIGGER template_versions_immutable',
        );
      }
      await client.logicalTemplate.delete({ where: { tenantId: tenant.id } });
    }
    await client.refreshCredential.deleteMany({
      where: { session: { userId: { in: userIds } } },
    });
    await client.refreshSession.deleteMany({
      where: { userId: { in: userIds } },
    });
    await client.user.deleteMany({ where: { tenantId: tenant.id } });
    await client.tenant.delete({ where: { id: tenant.id } });
  }
  await Promise.all([
    app?.close(),
    client.$disconnect(),
    cleanupClient?.$disconnect(),
  ]);
});

describe("active template publication", () => {
  test("creates, preserves reorder-only submissions, and serializes changed publication", async () => {
    const token = accessTokens.get("publication:admin")!;
    const initialDefinition = {
      fields: [
        { key: "title", label: "Title", type: "text", required: true },
        {
          key: "category",
          label: "Category",
          type: "enum",
          required: false,
          options: ["Standard", "Custom"],
        },
      ],
    };
    const created = await putActiveTemplate(token, 0, initialDefinition);
    const oldContract = await createContract(token, {
      title: "Original contract",
      category: "Standard",
    });
    const unchanged = await putActiveTemplate(token, 1, {
      fields: [
        { ...initialDefinition.fields[1], options: ["Custom", "Standard"] },
        initialDefinition.fields[0],
      ],
    });
    const changedDefinition = {
      fields: [
        { ...initialDefinition.fields[0], label: "Document title" },
        initialDefinition.fields[1],
      ],
    };
    const competitors = await Promise.all([
      putActiveTemplate(token, 1, changedDefinition),
      putActiveTemplate(token, 1, changedDefinition),
    ]);
    const published = competitors.find(({ status }) => status === 200)!;
    const finalDefinition = {
      fields: [
        { ...initialDefinition.fields[0], label: "Final title" },
        initialDefinition.fields[1],
      ],
    };
    const [finalPublication, racedContract] = await Promise.all([
      putActiveTemplate(token, 2, finalDefinition),
      createContract(token, {
        title: "Raced contract",
        category: "Custom",
      }),
    ]);
    const active = await activeTemplate(token);
    const [oldDetail, oldHistory, racedDetail] = await Promise.all([
      contractDetail(token, oldContract.body.id),
      contractHistory(token, oldContract.body.id),
      contractDetail(token, racedContract.body.id),
    ]);
    const tenant = await client.tenant.findUniqueOrThrow({
      where: { slug: publicationTenantSlug },
      include: {
        logicalTemplate: {
          include: { versions: { orderBy: { createdAt: "asc" } } },
        },
      },
    });

    expect({
      created: { status: created.status, body: created.body },
      unchanged: { status: unchanged.status, body: unchanged.body },
      competitors: competitors
        .map(({ status, body }) => ({
          status,
          outcome: body.outcome,
          code: body.code,
        }))
        .sort((left, right) => left.status - right.status),
      active: active.body,
      oldContract: {
        detailVersion: oldDetail.body.templateVersion,
        historyVersion: oldHistory.body.entries[0].after.templateVersion,
      },
      publicationCreationRace: {
        statuses: [finalPublication.status, racedContract.status],
        coherent:
          (racedDetail.body.templateVersion.id ===
            published.body.template.templateVersionId &&
            racedDetail.body.templateVersion.fields[0].label ===
              "Document title") ||
          (racedDetail.body.templateVersion.id ===
            finalPublication.body.template.templateVersionId &&
            racedDetail.body.templateVersion.fields[0].label === "Final title"),
      },
      persisted: {
        revision: tenant.logicalTemplate?.revision,
        activeVersionId: tenant.logicalTemplate?.activeVersionId,
        versionCount: tenant.logicalTemplate?.versions.length,
      },
    }).toStrictEqual({
      created: {
        status: 200,
        body: {
          outcome: "CREATED",
          template: {
            logicalTemplateId: created.body.template.logicalTemplateId,
            templateVersionId: created.body.template.templateVersionId,
            revision: 1,
            fields: initialDefinition.fields,
          },
        },
      },
      unchanged: {
        status: 200,
        body: {
          outcome: "UNCHANGED",
          template: created.body.template,
        },
      },
      competitors: [
        { status: 200, outcome: "PUBLISHED", code: undefined },
        { status: 409, outcome: undefined, code: "TEMPLATE_REVISION_CONFLICT" },
      ],
      active: {
        ...created.body.template,
        templateVersionId: active.body.templateVersionId,
        revision: 3,
        fields: finalDefinition.fields,
      },
      oldContract: {
        detailVersion: {
          id: created.body.template.templateVersionId,
          fields: initialDefinition.fields,
        },
        historyVersion: {
          id: created.body.template.templateVersionId,
          fields: initialDefinition.fields,
        },
      },
      publicationCreationRace: {
        statuses: [200, 201],
        coherent: true,
      },
      persisted: {
        revision: 3,
        activeVersionId: active.body.templateVersionId,
        versionCount: 3,
      },
    });
  });

  test("enforces role, DTO, semantic validation, and revision-first conflicts", async () => {
    const member = accessTokens.get("acme:member")!;
    const admin = accessTokens.get("acme:admin")!;
    const definition = { fields: [] };
    const responses = await Promise.all([
      putActiveTemplate(member, 1, definition),
      putActiveTemplate(admin, -1, definition),
      putActiveTemplate(admin, 1, definition),
      putActiveTemplate(admin, 0, definition),
    ]);

    expect(
      responses.map(({ status, body }) => ({ status, code: body.code })),
    ).toStrictEqual([
      { status: 403, code: undefined },
      { status: 400, code: undefined },
      { status: 400, code: "INVALID_TEMPLATE_DEFINITION" },
      { status: 409, code: "TEMPLATE_REVISION_CONFLICT" },
    ]);
  });
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
