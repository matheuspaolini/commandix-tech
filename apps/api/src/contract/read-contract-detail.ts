import type { ContractValues } from "./contract-values";
import type { TemplateDefinition } from "./template-definition";
import { ContractNotFound } from "./contract-errors";

export { ContractNotFound } from "./contract-errors";

export type ContractStatus = "DRAFT" | "ACTIVE" | "CLOSED";

export type ContractDetailRecord = {
  id: string;
  status: ContractStatus;
  revision: number;
  values: ContractValues;
  templateVersion: {
    id: string;
    definition: TemplateDefinition;
  };
};

export type ContractDetail = {
  id: string;
  status: ContractStatus;
  revision: number;
  values: ContractValues;
  templateVersion: {
    id: string;
    fields: TemplateDefinition["fields"];
  };
};

export interface ContractDetailRepository {
  findByTenantAndId(input: {
    tenantId: string;
    contractId: string;
  }): Promise<ContractDetailRecord | null>;
}

export class ReadContractDetail {
  constructor(private readonly contracts: ContractDetailRepository) {}

  async execute(query: {
    tenantId: string;
    contractId: string;
  }): Promise<ContractDetail> {
    const contract = await this.contracts.findByTenantAndId(query);
    if (!contract) throw new ContractNotFound();

    return {
      id: contract.id,
      status: contract.status,
      revision: contract.revision,
      values: contract.values,
      templateVersion: {
        id: contract.templateVersion.id,
        fields: contract.templateVersion.definition.fields,
      },
    };
  }
}

export const CONTRACT_DETAIL_REPOSITORY = Symbol("CONTRACT_DETAIL_REPOSITORY");
