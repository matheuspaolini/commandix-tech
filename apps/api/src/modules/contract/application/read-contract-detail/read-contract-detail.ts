import type { ContractValues } from "@/modules/contract/domain/contract-values";
import type { TemplateDefinition } from "@/modules/contract/domain/template-definition";
import { ContractNotFound } from "@/modules/contract/domain/contract-errors";
import type { ContractStatus } from "@/modules/contract/domain/entities";

export { ContractNotFound } from "@/modules/contract/domain/contract-errors";

export type { ContractStatus } from "@/modules/contract/domain/entities";

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
