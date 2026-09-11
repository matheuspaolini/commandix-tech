import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPrismaClient } from "@commandix/database";
import type { DatabaseService } from "@/platform/database";
import { parseContractActivatedEvent } from "@commandix/contract-events";
import { PrismaActivationNotificationRepository } from "./prisma-activation-notification.repository";
import {
  ActivationRevisionInvalidError,
  ContractReferenceInvalidError,
  EventIdentityConflictError,
} from "@/modules/notification/application/process-contract-activated-event/process-contract-activated-event";

const client = createPrismaClient({
  datasourceUrl: Bun.env.TEST_DATABASE_URL ?? Bun.env.DATABASE_URL ?? "",
});
const repository = new PrismaActivationNotificationRepository({
  client,
} as DatabaseService);
const tenantIds: string[] = [];
let tenantId: string;
let otherTenantId: string;
let activeContractId: string;
let closedContractId: string;

beforeAll(async () => {
  const primary = await createWorkspace("ACTIVE", 2);
  const other = await createWorkspace("DRAFT", 1);
  tenantId = primary.tenantId;
  otherTenantId = other.tenantId;
  activeContractId = primary.contractId;
  closedContractId = await createContract(
    primary.tenantId,
    primary.versionId,
    "CLOSED",
    3,
  );
});

afterAll(async () => {
  await client.notificationLog.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await client.$disconnect();
});

describe("Activation notification persistence", () => {
  test("records complete evidence for Active and Closed Contracts", async () => {
    const active = event();
    const closed = event({ contractId: closedContractId });
    const processedAt = new Date("2026-09-10T15:00:00.000Z");
    const outcomes = await Promise.all([
      repository.record(active, processedAt),
      repository.record(closed, processedAt),
    ]);
    const rows = await client.notificationLog.findMany({
      where: { eventId: { in: [active.eventId, closed.eventId] } },
      orderBy: { contractId: "asc" },
    });
    expect({
      outcomes,
      rows: rows.map(({ processedAt, ...row }) => ({ ...row, processedAt })),
    }).toMatchObject({
      outcomes: ["created", "created"],
      rows: expect.arrayContaining([
        expect.objectContaining({
          eventId: active.eventId,
          tenantId,
          activationRevision: 2,
          processedAt,
        }),
        expect.objectContaining({
          eventId: closed.eventId,
          tenantId,
          activationRevision: 2,
          processedAt,
        }),
      ]),
    });
  });

  test("makes sequential and concurrent identical deliveries no-ops", async () => {
    const activation = event();
    const concurrent = await Promise.all([
      repository.record(activation, new Date()),
      repository.record(activation, new Date()),
    ]);
    const sequential = await repository.record(activation, new Date());
    const count = await client.notificationLog.count({
      where: { eventId: activation.eventId },
    });
    expect({ concurrent: concurrent.sort(), sequential, count }).toStrictEqual({
      concurrent: ["created", "duplicate"],
      sequential: "duplicate",
      count: 1,
    });
  });

  test("rejects missing, foreign-Tenant, and future-revision references", async () => {
    const failures = await Promise.all([
      capture(() =>
        repository.record(
          event({ contractId: crypto.randomUUID() }),
          new Date(),
        ),
      ),
      capture(() =>
        repository.record(event({ tenantId: otherTenantId }), new Date()),
      ),
      capture(() =>
        repository.record(event({ activationRevision: 3 }), new Date()),
      ),
    ]);
    expect(failures.map((failure) => failure?.constructor)).toStrictEqual([
      ContractReferenceInvalidError,
      ContractReferenceInvalidError,
      ActivationRevisionInvalidError,
    ]);
  });

  test("rejects conflicting identity reuse and preserves the first event", async () => {
    const activation = event();
    await repository.record(activation, new Date());
    const failure = await capture(() =>
      repository.record(
        { ...activation, correlationId: crypto.randomUUID() },
        new Date(),
      ),
    );
    const count = await client.notificationLog.count({
      where: { eventId: activation.eventId },
    });
    expect({ failure: failure?.constructor, count }).toStrictEqual({
      failure: EventIdentityConflictError,
      count: 1,
    });
  });

  test("database constraints reject a Contract and Tenant mismatch", async () => {
    const activation = event();
    const failure = await capture(() =>
      client.notificationLog.create({
        data: {
          ...activation,
          tenantId: otherTenantId,
        },
      }),
    );
    const count = await client.notificationLog.count({
      where: { eventId: activation.eventId },
    });
    expect({ failed: failure instanceof Error, count }).toStrictEqual({
      failed: true,
      count: 0,
    });
  });
});

function event(overrides: Record<string, unknown> = {}) {
  return parseContractActivatedEvent({
    eventId: crypto.randomUUID(),
    eventType: "contract.activated",
    schemaVersion: 1,
    tenantId,
    contractId: activeContractId,
    activationRevision: 2,
    occurredAt: "2026-09-10T14:03:22.123Z",
    correlationId: crypto.randomUUID(),
    ...overrides,
  });
}

async function capture(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  return undefined;
}

async function createWorkspace(status: "ACTIVE" | "DRAFT", revision: number) {
  const tenant = await client.tenant.create({
    data: { slug: `notification-${crypto.randomUUID()}` },
  });
  tenantIds.push(tenant.id);
  const logical = await client.logicalTemplate.create({
    data: { tenantId: tenant.id },
  });
  const version = await client.templateVersion.create({
    data: {
      tenantId: tenant.id,
      logicalTemplateId: logical.id,
      definition: { fields: [] },
    },
  });
  const contractId = await createContract(
    tenant.id,
    version.id,
    status,
    revision,
  );
  return { tenantId: tenant.id, versionId: version.id, contractId };
}

async function createContract(
  tenantId: string,
  templateVersionId: string,
  status: "ACTIVE" | "CLOSED" | "DRAFT",
  revision: number,
) {
  const contract = await client.contract.create({
    data: {
      tenantId,
      templateVersionId,
      status,
      revision,
      values: {},
      createdAt: new Date(),
    },
  });
  return contract.id;
}
