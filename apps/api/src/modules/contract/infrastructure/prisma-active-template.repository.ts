import { Injectable } from "@nestjs/common";

import { DatabaseService } from "@/platform/database";
import type {
  ActiveTemplate,
  ActiveTemplateRepository,
} from "@/modules/contract/application/publish-template/active-template.repository";
import { canonicalTemplateDefinition } from "@/modules/contract/domain/template-definition";
import {
  LogicalTemplateEntity,
  LogicalTemplateIdentifier,
  TemplateVersionEntity,
  TemplateVersionIdentifier,
  TenantIdentifier,
} from "@/modules/contract/domain/entities";

@Injectable()
export class PrismaActiveTemplateRepository implements ActiveTemplateRepository {
  constructor(private readonly database: DatabaseService) {}

  async findActiveByTenantId(tenantId: string): Promise<ActiveTemplate | null> {
    const logicalTemplate =
      await this.database.client.logicalTemplate.findUnique({
        where: { tenantId },
        select: {
          id: true,
          revision: true,
          activeVersion: { select: { id: true, definition: true } },
        },
      });
    if (!logicalTemplate?.activeVersion) return null;

    const tenant = TenantIdentifier.from(tenantId);
    const version = TemplateVersionEntity.reconstitute({
      id: TemplateVersionIdentifier.from(logicalTemplate.activeVersion.id),
      logicalTemplateId: LogicalTemplateIdentifier.from(logicalTemplate.id),
      tenantId: tenant,
      definition: canonicalTemplateDefinition(
        logicalTemplate.activeVersion.definition,
      ),
    });
    const template = LogicalTemplateEntity.reconstitute({
      id: LogicalTemplateIdentifier.from(logicalTemplate.id),
      tenantId: tenant,
      revision: logicalTemplate.revision,
      activeVersionId: version.id,
    });
    return {
      ...template.activeTemplate(),
      fields: version.definitionForPresentation().fields,
    };
  }
}
