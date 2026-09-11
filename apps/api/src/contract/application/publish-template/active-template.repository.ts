import type { TemplateField } from "@/contract/domain/template-definition";

export type ActiveTemplate = {
  logicalTemplateId: string;
  templateVersionId: string;
  revision: number;
  fields: TemplateField[];
};

export interface ActiveTemplateRepository {
  findActiveByTenantId(tenantId: string): Promise<ActiveTemplate | null>;
}

export const ACTIVE_TEMPLATE_REPOSITORY = Symbol("ACTIVE_TEMPLATE_REPOSITORY");
