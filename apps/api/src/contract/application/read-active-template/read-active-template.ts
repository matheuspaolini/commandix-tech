import type {
  ActiveTemplate,
  ActiveTemplateRepository,
} from "@/contract/application/publish-template/active-template.repository";

export class ActiveTemplateNotFound extends Error {}

export class ReadActiveTemplate {
  constructor(private readonly templates: ActiveTemplateRepository) {}

  async execute(tenantId: string): Promise<ActiveTemplate> {
    const activeTemplate = await this.templates.findActiveByTenantId(tenantId);
    if (!activeTemplate) throw new ActiveTemplateNotFound();
    return activeTemplate;
  }
}
