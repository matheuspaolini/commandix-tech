import type { TemplateField } from "@/modules/contract/domain/template-definition";

/** The template data needed by Contract operations and projections. */
export type ContractTemplateVersion = {
  id: string;
  fields: TemplateField[];
};
