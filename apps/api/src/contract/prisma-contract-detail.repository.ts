import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database";
import { canonicalContractValues } from "./contract-values";
import type {
  ContractDetailRecord,
  ContractDetailRepository,
} from "./read-contract-detail";
import { canonicalTemplateDefinition } from "./template-definition";

@Injectable()
export class PrismaContractDetailRepository implements ContractDetailRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByTenantAndId(input: {
    tenantId: string;
    contractId: string;
  }): Promise<ContractDetailRecord | null> {
    const contract = await this.database.client.contract.findFirst({
      where: { id: input.contractId, tenantId: input.tenantId },
      select: {
        id: true,
        status: true,
        revision: true,
        values: true,
        templateVersion: { select: { id: true, definition: true } },
      },
    });
    if (!contract) return null;

    return {
      ...contract,
      values: canonicalContractValues(contract.values),
      templateVersion: {
        id: contract.templateVersion.id,
        definition: canonicalTemplateDefinition(
          contract.templateVersion.definition,
        ),
      },
    };
  }
}
