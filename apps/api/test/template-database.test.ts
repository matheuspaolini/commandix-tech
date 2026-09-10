import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPrismaClient } from "@commandix/database";

import { PrismaSeedWorkspaceRepository } from "../src/contract/prisma-seed-workspace.repository";
import type { DatabaseService } from "../src/database";

const client = createPrismaClient();
let acmeTenantId: string;
let globexTenantId: string;
let acmeLogicalTemplateId: string;
let acmeVersionId: string;
let globexVersionId: string;

beforeAll(async () => {
  const [acme, globex] = await Promise.all([
    client.tenant.findUniqueOrThrow({
      where: { slug: "acme" },
      include: { logicalTemplate: true },
    }),
    client.tenant.findUniqueOrThrow({
      where: { slug: "globex" },
      include: { logicalTemplate: true },
    }),
  ]);
  if (
    !acme.logicalTemplate?.activeVersionId ||
    !globex.logicalTemplate?.activeVersionId
  )
    throw new Error("Expected seeded active templates");
  acmeTenantId = acme.id;
  globexTenantId = globex.id;
  acmeLogicalTemplateId = acme.logicalTemplate.id;
  acmeVersionId = acme.logicalTemplate.activeVersionId;
  globexVersionId = globex.logicalTemplate.activeVersionId;
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

describe("template persistence invariants", () => {
  test("allows only one logical template per tenant", async () => {
    expect(
      await outcome(() =>
        client.logicalTemplate.create({ data: { tenantId: acmeTenantId } }),
      ),
    ).toBe("rejected");
  });

  test("rejects a non-positive logical template revision", async () => {
    const slug = `revision-${Bun.randomUUIDv7().replaceAll("-", "")}`;
    const tenant = await client.tenant.create({ data: { slug } });
    const result = await outcome(() =>
      client.logicalTemplate.create({
        data: { tenantId: tenant.id, revision: 0 },
      }),
    );
    await client.tenant.delete({ where: { id: tenant.id } });

    expect(result).toBe("rejected");
  });

  test("rejects a cross-tenant version relationship", async () => {
    expect(
      await outcome(() =>
        client.templateVersion.create({
          data: {
            logicalTemplateId: acmeLogicalTemplateId,
            tenantId: globexTenantId,
            definition: { fields: [] },
          },
        }),
      ),
    ).toBe("rejected");
  });

  test("runtime credentials cannot update immutable versions", async () => {
    expect(
      await outcome(() =>
        client.templateVersion.update({
          where: { id: acmeVersionId },
          data: { definition: { fields: [] } },
        }),
      ),
    ).toBe("rejected");
  });

  test("runtime credentials cannot delete immutable versions", async () => {
    expect(
      await outcome(() =>
        client.templateVersion.delete({ where: { id: acmeVersionId } }),
      ),
    ).toBe("rejected");
  });

  test("rejects an active version from another logical template", async () => {
    expect(
      await outcome(() =>
        client.logicalTemplate.update({
          where: { id: acmeLogicalTemplateId },
          data: { activeVersionId: globexVersionId },
        }),
      ),
    ).toBe("rejected");
  });

  test("rejects an invalid seed definition without partial persistence", async () => {
    const slug = `invalid-${Bun.randomUUIDv7().replaceAll("-", "")}`;
    const tenant = await client.tenant.create({ data: { slug } });
    const result = await outcome(async () => {
      const repository = new PrismaSeedWorkspaceRepository({
        client,
      } as DatabaseService);
      await repository.ensureTemplate(tenant.id, { fields: [] });
    });
    const persisted = await client.logicalTemplate.count({
      where: { tenantId: tenant.id },
    });
    await client.tenant.delete({ where: { id: tenant.id } });

    expect({ result, persisted }).toStrictEqual({
      result: "rejected",
      persisted: 0,
    });
  });

  test("rolls back an interrupted initial template transaction", async () => {
    const slug = `rollback-${Bun.randomUUIDv7().replaceAll("-", "")}`;
    const tenant = await client.tenant.create({ data: { slug } });
    await outcome(() =>
      client.$transaction(async (transaction) => {
        await transaction.logicalTemplate.create({
          data: { tenantId: tenant.id },
        });
        throw new Error("injected template seed failure");
      }),
    );
    const persisted = await client.logicalTemplate.count({
      where: { tenantId: tenant.id },
    });
    await client.tenant.delete({ where: { id: tenant.id } });

    expect(persisted).toBe(0);
  });
});
