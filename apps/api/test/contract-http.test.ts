import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPrismaClient, PrismaClient } from "@commandix/database";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp } from "../src/app";

Bun.env.JWT_SECRET ??= "local_development_jwt_secret_with_32_chars";
Bun.env.AUTH_ALLOWED_ORIGINS ??= "http://localhost:8080";
Bun.env.AUTH_COOKIE_SECURE ??= "false";

const PASSWORD = "Commandix-demo-2026!";
const client = createPrismaClient();
const testDatabaseUrl = Bun.env.TEST_DATABASE_URL;
const cleanupClient = testDatabaseUrl
  ? new PrismaClient({ datasourceUrl: testDatabaseUrl })
  : null;
let app: INestApplication;
const tokens = new Map<string, string>();

async function signIn(slug: string, email: string) {
  const response = await request(app.getHttpServer())
    .post("/auth/sign-in")
    .send({ slug, email, password: PASSWORD });
  return response.body.accessToken as string;
}
function create(token: string, values: unknown, extras: object = {}) {
  return request(app.getHttpServer())
    .post("/contracts")
    .set("Authorization", `Bearer ${token}`)
    .send({ values, ...extras });
}
function read(token: string, contractId: string) {
  return request(app.getHttpServer())
    .get(`/contracts/${contractId}`)
    .set("Authorization", `Bearer ${token}`);
}
function list(token: string, query = "") {
  return request(app.getHttpServer())
    .get(`/contracts${query}`)
    .set("Authorization", `Bearer ${token}`);
}
function history(token: string, contractId: string) {
  return request(app.getHttpServer())
    .get(`/contracts/${contractId}/history`)
    .set("Authorization", `Bearer ${token}`);
}
function activate(
  token: string,
  contractId: string,
  expectedRevision: unknown,
) {
  return request(app.getHttpServer())
    .post(`/contracts/${contractId}/activate`)
    .set("Authorization", `Bearer ${token}`)
    .send({ expectedRevision });
}
function close(token: string, contractId: string, expectedRevision: unknown) {
  return request(app.getHttpServer())
    .post(`/contracts/${contractId}/close`)
    .set("Authorization", `Bearer ${token}`)
    .send({ expectedRevision });
}
async function removeTemplateVersionFixture(versionId: string) {
  if (!cleanupClient) throw new Error("Missing TEST_DATABASE_URL");
  await cleanupClient.$executeRawUnsafe(
    'ALTER TABLE "template_versions" DISABLE TRIGGER template_versions_immutable',
  );
  try {
    await cleanupClient.templateVersion.delete({ where: { id: versionId } });
  } finally {
    await cleanupClient.$executeRawUnsafe(
      'ALTER TABLE "template_versions" ENABLE TRIGGER template_versions_immutable',
    );
  }
}

beforeAll(async () => {
  app = await createApp();
  await app.init();
  for (const slug of ["acme", "globex"])
    for (const role of ["admin", "member"])
      tokens.set(`${slug}:${role}`, await signIn(slug, `${role}@${slug}.test`));
});
afterAll(async () => {
  await Promise.all([
    app.close(),
    client.$disconnect(),
    cleanupClient?.$disconnect(),
  ]);
});

describe("POST /contracts", () => {
  test("allows both roles and keeps each Contract in its authenticated Tenant", async () => {
    const responses = await Promise.all([
      create(tokens.get("acme:admin")!, {
        title: "Admin contract",
        "effective-date": "2028-02-29",
      }),
      create(tokens.get("globex:member")!, {
        title: "Member contract",
        "effective-date": "2027-03-01",
        approved: false,
        amount: 0,
      }),
    ]);
    const persisted = await client.contract.findMany({
      where: { id: { in: responses.map((response) => response.body.id) } },
      include: { tenant: { select: { slug: true } }, history: true },
      orderBy: { tenant: { slug: "asc" } },
    });
    expect({
      responses: responses.map((response) => ({
        status: response.status,
        location: response.headers.location,
        body: response.body,
      })),
      persisted: persisted.map((contract) => ({
        tenant: contract.tenant.slug,
        status: contract.status,
        revision: contract.revision,
        values: contract.values,
        historyCount: contract.history.length,
        before: contract.history[0]?.beforeSnapshot,
        after: contract.history[0]?.afterSnapshot,
      })),
    }).toStrictEqual({
      responses: responses.map((response) => ({
        status: 201,
        location: `/contracts/${response.body.id}`,
        body: {
          id: response.body.id,
          status: "DRAFT",
          revision: 1,
          templateVersionId: response.body.templateVersionId,
        },
      })),
      persisted: [
        {
          tenant: "acme",
          status: "DRAFT",
          revision: 1,
          values: {
            title: "Admin contract",
            amount: 0,
            "effective-date": "2028-02-29",
            approved: false,
            category: "standard",
          },
          historyCount: 1,
          before: null,
          after: expect.objectContaining({ status: "DRAFT", revision: 1 }),
        },
        {
          tenant: "globex",
          status: "DRAFT",
          revision: 1,
          values: {
            title: "Member contract",
            amount: 0,
            "effective-date": "2027-03-01",
            approved: false,
            category: "standard",
          },
          historyCount: 1,
          before: null,
          after: expect.objectContaining({ status: "DRAFT", revision: 1 }),
        },
      ],
    });
  });

  test("returns deterministic validation issues without writing", async () => {
    const tenant = await client.tenant.findUniqueOrThrow({
      where: { slug: "acme" },
    });
    const before = await client.contract.count({
      where: { tenantId: tenant.id },
    });
    const response = await create(tokens.get("acme:admin")!, {
      title: "   ",
      "effective-date": "2027-02-29",
      unexpected: true,
    });
    const after = await client.contract.count({
      where: { tenantId: tenant.id },
    });
    expect({
      status: response.status,
      code: response.body.code,
      issues: response.body.issues,
      unchanged: after === before,
    }).toStrictEqual({
      status: 400,
      code: "INVALID_CONTRACT_VALUES",
      issues: [
        { key: "title", code: "INVALID_TEXT" },
        { key: "effective-date", code: "INVALID_DATE" },
        { key: "unexpected", code: "UNKNOWN_FIELD" },
      ],
      unchanged: true,
    });
  });

  test("rejects server-owned input properties", async () => {
    const response = await create(
      tokens.get("acme:member")!,
      { title: "A", "effective-date": "2027-01-01" },
      { tenantId: "globex", revision: 9 },
    );
    expect({
      status: response.status,
      error: response.body.error,
    }).toStrictEqual({ status: 400, error: "Bad Request" });
  });

  test("requires authentication", async () => {
    const response = await request(app.getHttpServer())
      .post("/contracts")
      .send({ values: {} });
    expect({
      status: response.status,
      error: response.body.error,
    }).toStrictEqual({ status: 401, error: "Unauthorized" });
  });

  test("returns the active-Template prerequisite conflict without writes", async () => {
    const slug = `contractless-${Bun.randomUUIDv7().replaceAll("-", "")}`;
    await request(app.getHttpServer())
      .post("/onboarding")
      .send({ slug, email: "admin@example.com", password: PASSWORD });
    const token = await signIn(slug, "admin@example.com");
    const tenant = await client.tenant.findUniqueOrThrow({ where: { slug } });
    const response = await create(token, {});
    const persisted = await client.contract.count({
      where: { tenantId: tenant.id },
    });
    expect({
      status: response.status,
      code: response.body.code,
      persisted,
    }).toStrictEqual({
      status: 409,
      code: "ACTIVE_TEMPLATE_REQUIRED",
      persisted: 0,
    });
  });
});

describe("GET /contracts/:id", () => {
  test("allows both roles to read an own-Tenant Contract", async () => {
    const created = await create(tokens.get("acme:admin")!, {
      title: "Readable contract",
      "effective-date": "2028-02-29",
      approved: false,
      amount: 0,
    });
    const responses = await Promise.all([
      read(tokens.get("acme:admin")!, created.body.id),
      read(tokens.get("acme:member")!, created.body.id),
    ]);

    expect(
      responses.map((response) => ({
        status: response.status,
        body: response.body,
      })),
    ).toStrictEqual(
      responses.map((response) => ({
        status: 200,
        body: {
          id: created.body.id,
          status: "DRAFT",
          revision: 1,
          values: {
            title: "Readable contract",
            amount: 0,
            "effective-date": "2028-02-29",
            approved: false,
            category: "standard",
          },
          templateVersion: {
            id: created.body.templateVersionId,
            fields: expect.any(Array),
          },
        },
      })),
    );
  });

  test("hides foreign and missing Contract identifiers behind the same 404", async () => {
    const foreign = await create(tokens.get("globex:admin")!, {
      title: "Foreign contract",
      "effective-date": "2027-01-01",
    });
    const responses = await Promise.all([
      read(tokens.get("acme:admin")!, foreign.body.id),
      read(tokens.get("acme:member")!, foreign.body.id),
      read(tokens.get("acme:admin")!, crypto.randomUUID()),
    ]);

    expect(
      responses.map((response) => ({
        status: response.status,
        code: response.body.code,
      })),
    ).toStrictEqual([
      { status: 404, code: "CONTRACT_NOT_FOUND" },
      { status: 404, code: "CONTRACT_NOT_FOUND" },
      { status: 404, code: "CONTRACT_NOT_FOUND" },
    ]);
  });

  test("rejects a malformed Contract identifier", async () => {
    const response = await read(tokens.get("acme:admin")!, "not-a-uuid");

    expect({
      status: response.status,
      error: response.body.error,
    }).toStrictEqual({ status: 400, error: "Bad Request" });
  });

  test("reads labels and types from the Contract's saved Template version", async () => {
    if (!cleanupClient) throw new Error("Missing TEST_DATABASE_URL");
    const created = await create(tokens.get("acme:admin")!, {
      title: "Versioned contract",
      "effective-date": "2028-01-31",
    });
    const tenant = await client.tenant.findUniqueOrThrow({
      where: { slug: "acme" },
      include: { logicalTemplate: true },
    });
    const logicalTemplate = tenant.logicalTemplate!;
    const replacementVersionId = crypto.randomUUID();
    const replacementDefinition = {
      fields: [
        {
          key: "replacement",
          label: "Replacement field",
          type: "text",
          required: true,
        },
      ],
    };

    try {
      await client.templateVersion.create({
        data: {
          id: replacementVersionId,
          tenantId: tenant.id,
          logicalTemplateId: logicalTemplate.id,
          definition: replacementDefinition,
        },
      });
      await client.logicalTemplate.update({
        where: { id: logicalTemplate.id },
        data: { activeVersionId: replacementVersionId },
      });

      const response = await read(tokens.get("acme:member")!, created.body.id);

      expect({
        status: response.status,
        savedVersionId: response.body.templateVersion.id,
        savedFields: response.body.templateVersion.fields,
        excludesReplacement: response.body.templateVersion.fields.every(
          (field: { key: string }) => field.key !== "replacement",
        ),
      }).toStrictEqual({
        status: 200,
        savedVersionId: created.body.templateVersionId,
        savedFields: expect.arrayContaining([
          expect.objectContaining({
            key: "effective-date",
            label: "Effective date",
            type: "date",
          }),
        ]),
        excludesReplacement: true,
      });
    } finally {
      await client.logicalTemplate.update({
        where: { id: logicalTemplate.id },
        data: { activeVersionId: logicalTemplate.activeVersionId },
      });
      await removeTemplateVersionFixture(replacementVersionId);
    }
  });
});

describe("POST /contracts/:id/activate", () => {
  test("allows an Admin to atomically activate an own-Tenant Draft", async () => {
    const created = await create(tokens.get("acme:admin")!, {
      title: "Activation contract",
      "effective-date": "2028-01-01",
    });
    const response = await activate(
      tokens.get("acme:admin")!,
      created.body.id,
      1,
    );
    const persisted = await client.contract.findUniqueOrThrow({
      where: { id: created.body.id },
      include: {
        history: { orderBy: { revision: "asc" } },
        activationOutbox: true,
      },
    });

    expect({
      response: {
        status: response.status,
        body: response.body,
      },
      persisted: {
        status: persisted.status,
        revision: persisted.revision,
        history: persisted.history.map((entry) => ({
          action: entry.action,
          revision: entry.revision,
          before: entry.beforeSnapshot,
          after: entry.afterSnapshot,
        })),
        outbox: persisted.activationOutbox.map((event) => ({
          type: event.eventType,
          version: event.schemaVersion,
          revision: event.activationRevision,
          correlationId: event.correlationId,
          attempts: event.attemptCount,
          publishedAt: event.publishedAt,
        })),
      },
    }).toStrictEqual({
      response: {
        status: 200,
        body: {
          id: created.body.id,
          status: "ACTIVE",
          revision: 2,
          values: expect.any(Object),
          templateVersion: {
            id: created.body.templateVersionId,
            fields: expect.any(Array),
          },
        },
      },
      persisted: {
        status: "ACTIVE",
        revision: 2,
        history: [
          {
            action: "CREATED",
            revision: 1,
            before: null,
            after: expect.any(Object),
          },
          {
            action: "ACTIVATED",
            revision: 2,
            before: expect.objectContaining({ status: "DRAFT", revision: 1 }),
            after: expect.objectContaining({ status: "ACTIVE", revision: 2 }),
          },
        ],
        outbox: [
          {
            type: "contract.activated",
            version: 1,
            revision: 2,
            correlationId: expect.any(String),
            attempts: 0,
            publishedAt: null,
          },
        ],
      },
    });
  });

  test("rejects Member, stale, and repeated activation without extra writes", async () => {
    const created = await create(tokens.get("acme:admin")!, {
      title: "Conflict contract",
      "effective-date": "2028-01-01",
    });
    const member = await activate(
      tokens.get("acme:member")!,
      created.body.id,
      1,
    );
    const accepted = await activate(
      tokens.get("acme:admin")!,
      created.body.id,
      1,
    );
    const repeatedStale = await activate(
      tokens.get("acme:admin")!,
      created.body.id,
      1,
    );
    const repeatedCurrent = await activate(
      tokens.get("acme:admin")!,
      created.body.id,
      2,
    );
    const persisted = await client.contract.findUniqueOrThrow({
      where: { id: created.body.id },
      include: { history: true, activationOutbox: true },
    });

    expect({
      responses: [member, accepted, repeatedStale, repeatedCurrent].map(
        (response) => ({ status: response.status, code: response.body.code }),
      ),
      persisted: {
        status: persisted.status,
        revision: persisted.revision,
        history: persisted.history.length,
        outbox: persisted.activationOutbox.length,
      },
    }).toStrictEqual({
      responses: [
        { status: 403, code: undefined },
        { status: 200, code: undefined },
        { status: 409, code: "CONTRACT_REVISION_CONFLICT" },
        { status: 409, code: "CONTRACT_STATUS_CONFLICT" },
      ],
      persisted: { status: "ACTIVE", revision: 2, history: 2, outbox: 1 },
    });
  });
});

describe("POST /contracts/:id/close", () => {
  test("atomically closes an Active Contract without another Outbox event", async () => {
    const created = await create(tokens.get("acme:admin")!, {
      title: "Closure contract",
      "effective-date": "2028-01-01",
    });
    const activated = await activate(
      tokens.get("acme:admin")!,
      created.body.id,
      1,
    );
    const response = await close(tokens.get("acme:admin")!, created.body.id, 2);
    const persisted = await client.contract.findUniqueOrThrow({
      where: { id: created.body.id },
      include: {
        history: { orderBy: { revision: "asc" } },
        activationOutbox: true,
      },
    });

    expect({
      response: { status: response.status, body: response.body },
      persisted: {
        status: persisted.status,
        revision: persisted.revision,
        valuesPreserved:
          JSON.stringify(persisted.values) ===
          JSON.stringify(activated.body.values),
        templateVersionPreserved:
          persisted.templateVersionId === activated.body.templateVersion.id,
        actions: persisted.history.map(({ action }) => action),
        closure: {
          revision: persisted.history[2]?.revision,
          before: persisted.history[2]?.beforeSnapshot,
          after: persisted.history[2]?.afterSnapshot,
        },
        outbox: persisted.activationOutbox.length,
      },
    }).toStrictEqual({
      response: {
        status: 200,
        body: {
          id: created.body.id,
          status: "CLOSED",
          revision: 3,
          values: expect.any(Object),
          templateVersion: {
            id: created.body.templateVersionId,
            fields: expect.any(Array),
          },
        },
      },
      persisted: {
        status: "CLOSED",
        revision: 3,
        valuesPreserved: true,
        templateVersionPreserved: true,
        actions: ["CREATED", "ACTIVATED", "CLOSED"],
        closure: {
          revision: 3,
          before: expect.objectContaining({
            status: "ACTIVE",
            revision: 2,
          }),
          after: expect.objectContaining({
            status: "CLOSED",
            revision: 3,
          }),
        },
        outbox: 1,
      },
    });
  });

  test("permits one concurrent closure and rejects invalid closure without extra writes", async () => {
    const own = await create(tokens.get("acme:admin")!, {
      title: "Closure conflicts",
      "effective-date": "2028-01-01",
    });
    const foreignContract = await create(tokens.get("globex:admin")!, {
      title: "Foreign closure",
      "effective-date": "2028-01-01",
    });
    const skipped = await close(tokens.get("acme:admin")!, own.body.id, 1);
    await activate(tokens.get("acme:admin")!, own.body.id, 1);
    const member = await close(tokens.get("acme:member")!, own.body.id, 2);
    const foreign = await close(
      tokens.get("acme:admin")!,
      foreignContract.body.id,
      1,
    );
    const missing = await close(
      tokens.get("acme:admin")!,
      crypto.randomUUID(),
      1,
    );
    const concurrent = await Promise.all([
      close(tokens.get("acme:admin")!, own.body.id, 2),
      close(tokens.get("acme:admin")!, own.body.id, 2),
    ]);
    const repeated = await close(tokens.get("acme:admin")!, own.body.id, 3);
    const persisted = await client.contract.findUniqueOrThrow({
      where: { id: own.body.id },
      include: { history: true, activationOutbox: true },
    });

    expect({
      skipped: [skipped.status, skipped.body.code],
      member: member.status,
      hidden: [foreign, missing].map(({ status, body }) => [status, body.code]),
      concurrent: concurrent.map(({ status }) => status).sort(),
      repeated: [repeated.status, repeated.body.code],
      persisted: [
        persisted.status,
        persisted.revision,
        persisted.history.length,
        persisted.activationOutbox.length,
      ],
    }).toStrictEqual({
      skipped: [409, "CONTRACT_STATUS_CONFLICT"],
      member: 403,
      hidden: [
        [404, "CONTRACT_NOT_FOUND"],
        [404, "CONTRACT_NOT_FOUND"],
      ],
      concurrent: [200, 409],
      repeated: [409, "CONTRACT_STATUS_CONFLICT"],
      persisted: ["CLOSED", 3, 3, 1],
    });
  });
});

describe("GET /contracts", () => {
  test("paginates deterministically without exposing foreign Contracts or totals", async () => {
    const created = await Promise.all(
      ["a", "b", "c"].map((suffix) =>
        create(tokens.get("acme:admin")!, {
          title: `Register ${suffix}`,
          "effective-date": "2028-01-01",
        }),
      ),
    );
    const foreign = await create(tokens.get("globex:admin")!, {
      title: "Foreign register",
      "effective-date": "2028-01-01",
    });
    const tiedAt = new Date("2099-01-01T00:00:00.000Z");
    await client.contract.updateMany({
      where: { id: { in: created.map((response) => response.body.id) } },
      data: { createdAt: tiedAt },
    });
    await client.contract.update({
      where: { id: foreign.body.id },
      data: { createdAt: tiedAt },
    });

    const first = await list(tokens.get("acme:member")!, "?limit=2");
    const second = await list(
      tokens.get("acme:admin")!,
      `?limit=2&after=${encodeURIComponent(first.body.nextCursor)}`,
    );
    const ownIds = created
      .map((response) => response.body.id)
      .sort()
      .reverse();

    expect({
      first: {
        status: first.status,
        keys: Object.keys(first.body).sort(),
        ids: first.body.items.map((item: { id: string }) => item.id),
        nextCursor: typeof first.body.nextCursor,
      },
      second: {
        status: second.status,
        firstId: second.body.items[0]?.id,
      },
      foreignIncluded: [...first.body.items, ...second.body.items].some(
        (item: { id: string }) => item.id === foreign.body.id,
      ),
    }).toStrictEqual({
      first: {
        status: 200,
        keys: ["items", "nextCursor"],
        ids: ownIds.slice(0, 2),
        nextCursor: "string",
      },
      second: { status: 200, firstId: ownIds[2] },
      foreignIncluded: false,
    });
  });

  test("uses the default limit and rejects every invalid page shape", async () => {
    const accepted = await list(tokens.get("acme:admin")!);
    const invalid = await Promise.all(
      [
        "?limit=0",
        "?limit=1.5",
        "?limit=101",
        "?limit=1&limit=2",
        "?after=",
        "?after=not-a-cursor",
        "?unknown=true",
      ].map((query) => list(tokens.get("acme:admin")!, query)),
    );

    expect({
      accepted: {
        status: accepted.status,
        withinDefault: accepted.body.items.length <= 20,
      },
      invalid: invalid.map((response) => ({
        status: response.status,
        code: response.body.code,
      })),
    }).toStrictEqual({
      accepted: { status: 200, withinDefault: true },
      invalid: Array.from({ length: 7 }, () => ({
        status: 400,
        code: "INVALID_PAGINATION",
      })),
    });
  });
});

describe("GET /contracts/:id/history", () => {
  test("returns a complete version-aware timeline to both roles", async () => {
    const created = await create(tokens.get("acme:admin")!, {
      title: "History contract",
      "effective-date": "2028-02-29",
      approved: false,
      amount: 0,
    });
    await activate(tokens.get("acme:admin")!, created.body.id, 1);
    const responses = await Promise.all([
      history(tokens.get("acme:admin")!, created.body.id),
      history(tokens.get("acme:member")!, created.body.id),
    ]);

    expect(
      responses.map((response) => ({
        status: response.status,
        contract: response.body.contract,
        entries: response.body.entries.map((entry: any) => ({
          action: entry.action,
          revision: entry.revision,
          occurredAt: entry.occurredAt,
          actor: entry.actor,
          before: entry.before,
          after: entry.after,
        })),
      })),
    ).toStrictEqual(
      responses.map(() => ({
        status: 200,
        contract: { id: created.body.id, status: "ACTIVE", revision: 2 },
        entries: [
          {
            action: "CREATED",
            revision: 1,
            occurredAt: expect.any(String),
            actor: {
              id: expect.any(String),
              email: "admin@acme.test",
            },
            before: null,
            after: expect.objectContaining({
              status: "DRAFT",
              revision: 1,
              values: expect.objectContaining({ approved: false, amount: 0 }),
              templateVersion: {
                id: created.body.templateVersionId,
                fields: expect.any(Array),
              },
            }),
          },
          {
            action: "ACTIVATED",
            revision: 2,
            occurredAt: expect.any(String),
            actor: {
              id: expect.any(String),
              email: "admin@acme.test",
            },
            before: expect.objectContaining({ status: "DRAFT", revision: 1 }),
            after: expect.objectContaining({ status: "ACTIVE", revision: 2 }),
          },
        ],
      })),
    );
  });

  test("hides foreign and missing History behind the same 404", async () => {
    const foreign = await create(tokens.get("globex:member")!, {
      title: "Foreign history",
      "effective-date": "2028-01-01",
    });
    const responses = await Promise.all([
      history(tokens.get("acme:admin")!, foreign.body.id),
      history(tokens.get("acme:member")!, foreign.body.id),
      history(tokens.get("acme:admin")!, crypto.randomUUID()),
    ]);

    expect(
      responses.map((response) => ({
        status: response.status,
        code: response.body.code,
      })),
    ).toStrictEqual([
      { status: 404, code: "CONTRACT_NOT_FOUND" },
      { status: 404, code: "CONTRACT_NOT_FOUND" },
      { status: 404, code: "CONTRACT_NOT_FOUND" },
    ]);
  });
});
