export { ContractStatusConflict } from "@/modules/contract/domain/entities";

export class ContractNotFound extends Error {}
export class ContractRevisionConflict extends Error {}
export class TemplateVersionNotFound extends Error {}
export class TemplateVersionNotActive extends Error {}
