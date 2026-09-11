import { Prisma, type PrismaClient } from "@commandix/database";
import { Injectable } from "@nestjs/common";

import { DatabaseService } from "@/database";
import type {
  ActiveTemplateForCreation,
  ContractCreationTransaction,
  ContractCreationTransactions,
  CreationHistory,
  NewContract,
} from "@/contract/application/create-contract/create-contract";
import { canonicalTemplateDefinition } from "@/contract/domain/template-definition";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

class PrismaContractCreationTransaction implements ContractCreationTransaction {
  constructor(private readonly transaction: TransactionClient) {}

  async findActiveTemplateForUpdate(
    tenantId: string,
  ): Promise<ActiveTemplateForCreation | null> {
    const rows = await this.transaction.$queryRaw<
      { active_version_id: string | null }[]
    >`SELECT "active_version_id" FROM "logical_templates" WHERE "tenant_id" = ${tenantId}::uuid FOR UPDATE`;
    const activeVersionId = rows[0]?.active_version_id;
    if (!activeVersionId) return null;
    const version = await this.transaction.templateVersion.findFirst({
      where: { id: activeVersionId, tenantId },
      select: { id: true, definition: true },
    });
    if (!version) return null;
    return {
      id: version.id,
      definition: canonicalTemplateDefinition(version.definition),
    };
  }

  async insertContractAndHistory(input: {
    contract: NewContract;
    history: CreationHistory;
  }): Promise<void> {
    const { contract, history } = input;
    await this.transaction.contract.create({
      data: {
        id: contract.id,
        tenantId: contract.tenantId,
        templateVersionId: contract.templateVersionId,
        status: contract.status,
        revision: contract.revision,
        values: contract.values as Prisma.InputJsonValue,
        createdAt: contract.createdAt,
      },
    });
    await this.transaction.contractHistory.create({
      data: {
        id: history.id,
        tenantId: history.tenantId,
        contractId: history.contractId,
        actorId: history.actorId,
        action: history.action,
        revision: history.revision,
        occurredAt: history.occurredAt,
        beforeSnapshot: Prisma.DbNull,
        afterSnapshot: history.after as Prisma.InputJsonValue,
      },
    });
  }
}

@Injectable()
export class PrismaContractCreationTransactions implements ContractCreationTransactions {
  constructor(private readonly database: DatabaseService) {}

  run<T>(
    operation: (transaction: ContractCreationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.client.$transaction((transaction) =>
      operation(new PrismaContractCreationTransaction(transaction)),
    );
  }
}
