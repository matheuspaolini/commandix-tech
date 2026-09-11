import { Injectable } from "@nestjs/common";

import { DatabaseService } from "@/database";
import type {
  ActiveTemplate,
  ActiveTemplateRepository,
} from "@/contract/application/publish-template/active-template.repository";
import { canonicalTemplateDefinition } from "@/contract/domain/template-definition";

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

    const definition = canonicalTemplateDefinition(
      logicalTemplate.activeVersion.definition,
    );
    return {
      logicalTemplateId: logicalTemplate.id,
      templateVersionId: logicalTemplate.activeVersion.id,
      revision: logicalTemplate.revision,
      fields: definition.fields,
    };
  }
}
