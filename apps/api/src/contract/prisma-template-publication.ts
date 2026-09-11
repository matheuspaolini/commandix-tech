import { Prisma, type PrismaClient } from "@commandix/database";
import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database";
import type { ActiveTemplate } from "./active-template.repository";
import {
  type LockedLogicalTemplate,
  type TemplatePublicationTransaction,
  type TemplatePublicationTransactions,
} from "./template-publication";
import {
  canonicalTemplateDefinition,
  type TemplateDefinition,
} from "./template-definition";

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
      id: logicalTemplate.id,
      tenantId: logicalTemplate.tenant_id,
      revision: logicalTemplate.revision,
      activeVersion: {
        id: activeVersion.id,
        definition: canonicalTemplateDefinition(activeVersion.definition),
      },
    };
  }

  async createInitial(input: {
    tenantId: string;
    definition: TemplateDefinition;
  }): Promise<ActiveTemplate> {
    const logicalTemplate = await this.transaction.logicalTemplate.create({
      data: { tenantId: input.tenantId, revision: 1 },
      select: { id: true },
    });
    const version = await this.transaction.templateVersion.create({
      data: {
        logicalTemplateId: logicalTemplate.id,
        tenantId: input.tenantId,
        definition: input.definition as Prisma.InputJsonValue,
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
      1,
      input.definition,
    );
  }

  async publishNext(input: {
    logicalTemplateId: string;
    tenantId: string;
    previousRevision: number;
    nextRevision: number;
    definition: TemplateDefinition;
  }): Promise<ActiveTemplate> {
    const version = await this.transaction.templateVersion.create({
      data: {
        logicalTemplateId: input.logicalTemplateId,
        tenantId: input.tenantId,
        definition: input.definition as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    const updated = await this.transaction.logicalTemplate.updateMany({
      where: {
        id: input.logicalTemplateId,
        tenantId: input.tenantId,
        revision: input.previousRevision,
      },
      data: {
        activeVersionId: version.id,
        revision: input.nextRevision,
      },
    });
    if (updated.count !== 1)
      throw new Error("Locked Logical Template changed unexpectedly");
    return mapActiveTemplate(
      input.logicalTemplateId,
      version.id,
      input.nextRevision,
      input.definition,
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
