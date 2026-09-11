import { Prisma, type PrismaClient } from "@commandix/database";
import { Injectable } from "@nestjs/common";

import { DatabaseService } from "@/database";
import type { ActiveTemplate } from "@/contract/application/publish-template/active-template.repository";
import {
  type LockedLogicalTemplate,
  type TemplatePublicationTransaction,
  type TemplatePublicationTransactions,
} from "@/contract/application/publish-template/template-publication";
import {
  canonicalTemplateDefinition,
  type TemplateDefinition,
} from "@/contract/domain/template-definition";
import {
  LogicalTemplateEntity,
  LogicalTemplateIdentifier,
  TemplateVersionEntity,
  TemplateVersionIdentifier,
  TenantIdentifier,
} from "@/contract/domain/entities";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

class PrismaTemplatePublicationTransaction implements TemplatePublicationTransaction {
  constructor(private readonly transaction: TransactionClient) {}

  async lockTenant(tenantId: string): Promise<boolean> {
    const rows = await this.transaction.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId}::uuid FOR NO KEY UPDATE`;
    return rows.length === 1;
  }

  async findLogicalTemplateForUpdate(
    tenantId: string,
  ): Promise<LockedLogicalTemplate | null> {
    const rows = await this.transaction.$queryRaw<
      {
        id: string;
        tenant_id: string;
        revision: number;
        active_version_id: string | null;
      }[]
    >`SELECT "id", "tenant_id", "revision", "active_version_id"
      FROM "logical_templates"
      WHERE "tenant_id" = ${tenantId}::uuid
      FOR UPDATE`;
    const logicalTemplate = rows[0];
    if (!logicalTemplate) return null;
    if (!logicalTemplate.active_version_id)
      throw new Error("Logical Template has no active version");

    const activeVersion = await this.transaction.templateVersion.findFirst({
      where: {
        id: logicalTemplate.active_version_id,
        logicalTemplateId: logicalTemplate.id,
        tenantId,
      },
      select: { id: true, definition: true },
    });
    if (!activeVersion)
      throw new Error("Logical Template active version is missing");

    return {
      logicalTemplate: LogicalTemplateEntity.reconstitute({
        id: LogicalTemplateIdentifier.from(logicalTemplate.id),
        tenantId: TenantIdentifier.from(logicalTemplate.tenant_id),
        revision: logicalTemplate.revision,
        activeVersionId: TemplateVersionIdentifier.from(
          logicalTemplate.active_version_id,
        ),
      }),
      activeVersion: TemplateVersionEntity.reconstitute({
        id: TemplateVersionIdentifier.from(activeVersion.id),
        logicalTemplateId: LogicalTemplateIdentifier.from(logicalTemplate.id),
        tenantId: TenantIdentifier.from(logicalTemplate.tenant_id),
        definition: canonicalTemplateDefinition(activeVersion.definition),
      }),
    };
  }

  async createInitial(input: {
    logicalTemplate: LockedLogicalTemplate["logicalTemplate"];
    version: LockedLogicalTemplate["activeVersion"];
  }): Promise<ActiveTemplate> {
    const logicalTemplate = await this.transaction.logicalTemplate.create({
      data: {
        id: input.logicalTemplate.id.value,
        tenantId: input.logicalTemplate.tenantId.value,
        revision: input.logicalTemplate.revision,
      },
      select: { id: true },
    });
    const version = await this.transaction.templateVersion.create({
      data: {
        id: input.version.id.value,
        logicalTemplateId: logicalTemplate.id,
        tenantId: input.version.tenantId.value,
        definition: input.version.definition as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await this.transaction.logicalTemplate.update({
      where: { id: logicalTemplate.id },
      data: { activeVersionId: version.id },
    });
    return mapActiveTemplate(
      logicalTemplate.id,
      version.id,
      input.logicalTemplate.revision,
      input.version.definitionForPresentation(),
    );
  }

  async publishNext(input: {
    logicalTemplate: LockedLogicalTemplate["logicalTemplate"];
    version: LockedLogicalTemplate["activeVersion"];
  }): Promise<ActiveTemplate> {
    const version = await this.transaction.templateVersion.create({
      data: {
        id: input.version.id.value,
        logicalTemplateId: input.version.logicalTemplateId.value,
        tenantId: input.version.tenantId.value,
        definition: input.version.definition as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    const updated = await this.transaction.logicalTemplate.updateMany({
      where: {
        id: input.logicalTemplate.id.value,
        tenantId: input.logicalTemplate.tenantId.value,
        revision: input.logicalTemplate.revision - 1,
      },
      data: {
        activeVersionId: version.id,
        revision: input.logicalTemplate.revision,
      },
    });
    if (updated.count !== 1)
      throw new Error("Locked Logical Template changed unexpectedly");
    return mapActiveTemplate(
      input.logicalTemplate.id.value,
      version.id,
      input.logicalTemplate.revision,
      input.version.definitionForPresentation(),
    );
  }
}

function mapActiveTemplate(
  logicalTemplateId: string,
  templateVersionId: string,
  revision: number,
  definition: TemplateDefinition,
): ActiveTemplate {
  return {
    logicalTemplateId,
    templateVersionId,
    revision,
    fields: definition.fields,
  };
}

@Injectable()
export class PrismaTemplatePublicationTransactions implements TemplatePublicationTransactions {
  constructor(private readonly database: DatabaseService) {}

  run<T>(
    operation: (transaction: TemplatePublicationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.client.$transaction((transaction) =>
      operation(new PrismaTemplatePublicationTransaction(transaction)),
    );
  }
}
