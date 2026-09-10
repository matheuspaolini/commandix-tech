import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPrismaClient } from "@commandix/database";
import { CreateContract } from "../src/contract/create-contract";
import { PrismaContractCreationTransactions } from "../src/contract/prisma-contract-creation";
import type { DatabaseService } from "../src/database";

const client = createPrismaClient();
let acmeTenantId: string;
let globexVersionId: string;
let acmeActorId: string;

beforeAll(async () => {
  const [acme, globex] = await Promise.all([
    client.tenant.findUniqueOrThrow({
      where: { slug: "acme" },
      include: { logicalTemplate: true, users: true },
    }),
    client.tenant.findUniqueOrThrow({
      where: { slug: "globex" },
      include: { logicalTemplate: true },
    }),
  ]);
  acmeTenantId = acme.id;
  acmeActorId = acme.users[0]!.id;
  globexVersionId = globex.logicalTemplate!.activeVersionId!;
});
afterAll(async () => {
  await client.$disconnect();
});

async function outcome(operation: () => Promise<unknown>) {
  try {
    await operation();
    return "resolved";
  } catch {
    return "rejected";
  }
}

describe("Contract persistence invariants", () => {
  test("rejects a cross-Tenant Template-version relationship", async () => {
    const result = await outcome(() =>
      client.contract.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: acmeTenantId,
          templateVersionId: globexVersionId,
          status: "DRAFT",
          revision: 1,
          values: {},
          createdAt: new Date(),
        },
      }),
    );
    expect(result).toBe("rejected");
  });

  test("rolls back the Contract when History insertion fails", async () => {
    const contractId = crypto.randomUUID();
    const ids = [contractId, crypto.randomUUID()];
    const useCase = new CreateContract(
      new PrismaContractCreationTransactions({ client } as DatabaseService),
      { now: () => new Date("2026-09-10T18:00:00Z") },
      { next: () => ids.shift()! },
    );
    const result = await outcome(() =>
      useCase.execute({
        tenantId: acmeTenantId,
        actorId: crypto.randomUUID(),
        suppliedValues: { title: "Rollback", "effective-date": "2027-01-01" },
      }),
    );
    const persisted = await client.contract.count({
      where: { id: contractId },
    });
    expect({ result, persisted }).toStrictEqual({
      result: "rejected",
      persisted: 0,
    });
  });

  test("runtime credentials cannot update History", async () => {
    const history = await ensureHistory();
    const result = await outcome(() =>
      client.contractHistory.update({
        where: { id: history.id },
        data: { revision: 2 },
      }),
    );
    const unchanged = await client.contractHistory.findUniqueOrThrow({
      where: { id: history.id },
    });
    expect({ result, revision: unchanged.revision }).toStrictEqual({
      result: "rejected",
      revision: history.revision,
    });
  });

  test("runtime credentials cannot delete History", async () => {
    const history = await ensureHistory();
    const result = await outcome(() =>
      client.contractHistory.delete({ where: { id: history.id } }),
    );
    const persisted = await client.contractHistory.count({
      where: { id: history.id },
    });
    expect({ result, persisted }).toStrictEqual({
      result: "rejected",
      persisted: 1,
    });
  });

  test("runtime credentials cannot truncate History", async () => {
    const history = await ensureHistory();
    const result = await outcome(() =>
      client.$executeRawUnsafe('TRUNCATE TABLE "contract_history"'),
    );
    const persisted = await client.contractHistory.count({
      where: { id: history.id },
    });
    expect({ result, persisted }).toStrictEqual({
      result: "rejected",
      persisted: 1,
    });
  });

  test("orders creation after a concurrent active Template publication", async () => {
    const tenant = await client.tenant.create({
      data: {
        slug: `ordering-${Bun.randomUUIDv7().replaceAll("-", "")}`,
        users: {
          create: {
            email: "admin@example.com",
            passwordHash: "test-only",
            role: "ADMIN",
          },
        },
      },
      include: { users: true },
    });
    const logicalTemplate = await client.logicalTemplate.create({
      data: { tenantId: tenant.id },
    });
    const original = await client.templateVersion.create({
      data: {
        tenantId: tenant.id,
        logicalTemplateId: logicalTemplate.id,
        definition: {
          fields: [
            { key: "old-field", label: "Old", type: "text", required: true },
          ],
        },
      },
    });
    await client.logicalTemplate.update({
      where: { id: logicalTemplate.id },
      data: { activeVersionId: original.id },
    });

    const useCase = new CreateContract(
      new PrismaContractCreationTransactions({ client } as DatabaseService),
    );
    let creation!: ReturnType<CreateContract["execute"]>;
    const published = await client.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "logical_templates" WHERE "id" = ${logicalTemplate.id}::uuid FOR UPDATE`;
      const version = await transaction.templateVersion.create({
        data: {
          tenantId: tenant.id,
          logicalTemplateId: logicalTemplate.id,
          definition: {
            fields: [
              {
                key: "new-field",
                label: "New",
                type: "text",
                required: true,
              },
            ],
          },
        },
      });
      creation = useCase.execute({
        tenantId: tenant.id,
        actorId: tenant.users[0]!.id,
        suppliedValues: { "new-field": "accepted" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      await transaction.logicalTemplate.update({
        where: { id: logicalTemplate.id },
        data: { activeVersionId: version.id, revision: { increment: 1 } },
      });
      return version;
    });
    const created = await creation;
    const persisted = await client.contract.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect({
      returnedVersion: created.templateVersionId,
      persistedVersion: persisted.templateVersionId,
      values: persisted.values,
    }).toStrictEqual({
      returnedVersion: published.id,
      persistedVersion: published.id,
      values: { "new-field": "accepted" },
    });
  });
});

async function ensureHistory() {
  const existing = await client.contractHistory.findFirst();
  if (existing) return existing;
  const useCase = new CreateContract(
    new PrismaContractCreationTransactions({ client } as DatabaseService),
  );
  const created = await useCase.execute({
    tenantId: acmeTenantId,
    actorId: acmeActorId,
    suppliedValues: { title: "Audit", "effective-date": "2027-01-01" },
  });
  return client.contractHistory.findFirstOrThrow({
    where: { contractId: created.id },
  });
}
