import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPrismaClient, PrismaClient } from "@commandix/database";

import { PrismaTemplatePublicationTransactions } from "@/modules/contract/infrastructure/prisma-template-publication";
import { PrismaSeedWorkspaceRepository } from "@/bootstrap/prisma-seed-workspace.repository";
import { PutActiveTemplate } from "@/modules/contract/application/publish-template/template-publication";
import type { DatabaseService } from "@/platform/database";
import {
  TemplateVersionEntity,
  TemplateVersionIdentifier,
} from "@/modules/contract/domain/entities";

const client = createPrismaClient({
  datasourceUrl: Bun.env.TEST_DATABASE_URL ?? Bun.env.DATABASE_URL ?? "",
});
const cleanupClient = Bun.env.TEST_DATABASE_URL
  ? new PrismaClient({ datasourceUrl: Bun.env.TEST_DATABASE_URL })
  : null;
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
  await Promise.all([client.$disconnect(), cleanupClient?.$disconnect()]);
});

const PUBLICATION_DEFINITION = {
  fields: [{ key: "title", label: "Title", type: "text", required: true }],
};

function publicationService() {
  const transactions = new PrismaTemplatePublicationTransactions({
    client,
  } as DatabaseService);
  return {
    transactions,
    service: new PutActiveTemplate(transactions, {
      next: () => crypto.randomUUID(),
    }),
  };
}

async function removePublishedTenant(tenantId: string) {
  if (!cleanupClient) throw new Error("Missing TEST_DATABASE_URL");
  await cleanupClient.logicalTemplate.updateMany({
    where: { tenantId },
    data: { activeVersionId: null },
  });
  await cleanupClient.$executeRawUnsafe(
    'ALTER TABLE "template_versions" DISABLE TRIGGER template_versions_immutable',
  );
  try {
    await cleanupClient.templateVersion.deleteMany({ where: { tenantId } });
  } finally {
    await cleanupClient.$executeRawUnsafe(
      'ALTER TABLE "template_versions" ENABLE TRIGGER template_versions_immutable',
    );
  }
  await client.logicalTemplate.deleteMany({ where: { tenantId } });
  await client.tenant.delete({ where: { id: tenantId } });
}

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

  test("serializes concurrent first publication with the Tenant row", async () => {
    const slug = `publication-${Bun.randomUUIDv7().replaceAll("-", "")}`;
    const tenant = await client.tenant.create({ data: { slug } });
    const { service } = publicationService();
    const results = await Promise.allSettled([
      service.execute({
        tenantId: tenant.id,
        actorId: Bun.randomUUIDv7(),
        expectedRevision: 0,
        definition: PUBLICATION_DEFINITION,
      }),
      service.execute({
        tenantId: tenant.id,
        actorId: Bun.randomUUIDv7(),
        expectedRevision: 0,
        definition: PUBLICATION_DEFINITION,
      }),
    ]);
    const persisted = await client.logicalTemplate.findUnique({
      where: { tenantId: tenant.id },
      include: { versions: true },
    });
    await removePublishedTenant(tenant.id);

    expect({
      results: results.map(({ status }) => status).sort(),
      revision: persisted?.revision,
      versionCount: persisted?.versions.length,
      hasActiveVersion: Boolean(persisted?.activeVersionId),
    }).toStrictEqual({
      results: ["fulfilled", "rejected"],
      revision: 1,
      versionCount: 1,
      hasActiveVersion: true,
    });
  });

  test("rolls back an interrupted subsequent publication", async () => {
    const slug = `publish-rollback-${Bun.randomUUIDv7().replaceAll("-", "")}`;
    const tenant = await client.tenant.create({ data: { slug } });
    const { service, transactions } = publicationService();
    await service.execute({
      tenantId: tenant.id,
      actorId: Bun.randomUUIDv7(),
      expectedRevision: 0,
      definition: PUBLICATION_DEFINITION,
    });
    await outcome(() =>
      transactions.run(async (transaction) => {
        await transaction.lockTenant(tenant.id);
        const current = await transaction.findLogicalTemplateForUpdate(
          tenant.id,
        );
        if (!current) throw new Error("Expected a Logical Template");
        const version = TemplateVersionEntity.create({
          id: TemplateVersionIdentifier.from(crypto.randomUUID()),
          logicalTemplateId: current.logicalTemplate.id,
          tenantId: current.logicalTemplate.tenantId,
          definition: {
            fields: [
              {
                key: "title",
                label: "Document title",
                type: "text",
                required: true,
              },
            ],
          },
        });
        await transaction.publishNext({
          logicalTemplate: current.logicalTemplate.publish(version.id),
          version,
        });
        throw new Error("injected publication failure");
      }),
    );
    const persisted = await client.logicalTemplate.findUniqueOrThrow({
      where: { tenantId: tenant.id },
      include: { versions: true },
    });
    await removePublishedTenant(tenant.id);

    expect({
      revision: persisted.revision,
      versionCount: persisted.versions.length,
      activeVersionIsFirst:
        persisted.activeVersionId === persisted.versions[0]?.id,
    }).toStrictEqual({
      revision: 1,
      versionCount: 1,
      activeVersionIsFirst: true,
    });
  });
});
