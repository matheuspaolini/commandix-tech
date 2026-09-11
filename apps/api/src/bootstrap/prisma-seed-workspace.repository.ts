import { Prisma } from "@commandix/database";

import { DatabaseService } from "@/platform/database";
import {
  canonicalTemplateDefinition,
  type TemplateDefinition,
} from "@/modules/contract/domain/template-definition";
import {
  LogicalTemplateEntity,
  LogicalTemplateIdentifier,
  TemplateVersionEntity,
  TemplateVersionIdentifier,
  TenantIdentifier,
} from "@/modules/contract/domain/entities";
import type {
  SeedRole,
  SeedWorkspaceRepository,
} from "@/bootstrap/seed-workspaces";

export class AmbiguousSeedTemplate extends Error {}

export class PrismaSeedWorkspaceRepository implements SeedWorkspaceRepository {
  constructor(private readonly database: DatabaseService) {}

  async ensureTenant(slug: string): Promise<{ id: string; created: boolean }> {
    const existing = await this.database.client.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing) return { ...existing, created: false };

    try {
      const created = await this.database.client.tenant.create({
        data: { slug },
        select: { id: true },
      });
      return { ...created, created: true };
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const concurrent = await this.database.client.tenant.findUniqueOrThrow({
        where: { slug },
        select: { id: true },
      });
      return { ...concurrent, created: false };
    }
  }

  async hasUser(tenantId: string, email: string): Promise<boolean> {
    const user = await this.database.client.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
      select: { id: true },
    });
    return user !== null;
  }

  async createUser(input: {
    tenantId: string;
    email: string;
    passwordHash: string;
    role: SeedRole;
  }): Promise<boolean> {
    try {
      await this.database.client.user.create({ data: input });
      return true;
    } catch (error) {
      if (isUniqueConflict(error)) return false;
      throw error;
    }
  }

  async ensureTemplate(
    tenantId: string,
    definition: TemplateDefinition,
  ): Promise<boolean> {
    const canonicalDefinition = canonicalTemplateDefinition(definition);
    return this.database.client.$transaction(async (transaction) => {
      const existing = await transaction.logicalTemplate.findUnique({
        where: { tenantId },
        select: {
          id: true,
          activeVersionId: true,
          _count: { select: { versions: true } },
        },
      });
      if (existing?.activeVersionId) return false;
      if (existing && existing._count.versions > 0)
        throw new AmbiguousSeedTemplate();

      const persistedTemplate =
        existing ??
        (await transaction.logicalTemplate.create({
          data: { id: crypto.randomUUID(), tenantId },
          select: {
            id: true,
            activeVersionId: true,
            _count: { select: { versions: true } },
          },
        }));
      const tenant = TenantIdentifier.from(tenantId);
      const version = TemplateVersionEntity.create({
        id: TemplateVersionIdentifier.from(crypto.randomUUID()),
        logicalTemplateId: LogicalTemplateIdentifier.from(persistedTemplate.id),
        tenantId: tenant,
        definition: canonicalDefinition,
      });
      const logicalTemplate = LogicalTemplateEntity.create({
        id: version.logicalTemplateId,
        tenantId: tenant,
        activeVersionId: version.id,
      });
      const persistedVersion = await transaction.templateVersion.create({
        data: {
          id: version.id.value,
          tenantId: version.tenantId.value,
          logicalTemplateId: version.logicalTemplateId.value,
          definition:
            version.definitionForPresentation() as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await transaction.logicalTemplate.update({
        where: { id: logicalTemplate.id.value },
        data: { activeVersionId: persistedVersion.id },
      });
      return true;
    });
  }
}

function isUniqueConflict(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
