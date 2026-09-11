import { Prisma, type PrismaClient } from "@commandix/database";
import { Injectable } from "@nestjs/common";
import { DatabaseService } from "@/database";
import { canonicalTemplateDefinition } from "@/contract/domain/template-definition";
import type {
  ActivationPersistence,
  ClosurePersistence,
  ContractMutationTransaction,
  ContractMutationTransactions,
  DraftEditPersistence,
  LockedContract,
} from "@/contract/application/edit-draft-values/contract-mutation";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

class PrismaContractMutationTransaction implements ContractMutationTransaction {
  constructor(private readonly transaction: TransactionClient) {}

  async findForUpdate(input: {
    tenantId: string;
    contractId: string;
  }): Promise<LockedContract | null> {
    const rows = await this.transaction.$queryRaw<
      Array<{
        id: string;
        tenant_id: string;
        status: "DRAFT" | "ACTIVE" | "CLOSED";
        revision: number;
        values: Prisma.JsonValue;
        template_version_id: string;
        definition: Prisma.JsonValue;
      }>
    >`SELECT c."id", c."tenant_id", c."status", c."revision", c."values",
        c."template_version_id", tv."definition"
      FROM "contracts" c
      JOIN "template_versions" tv
        ON tv."id" = c."template_version_id" AND tv."tenant_id" = c."tenant_id"
      WHERE c."id" = ${input.contractId}::uuid AND c."tenant_id" = ${input.tenantId}::uuid
      FOR UPDATE OF c`;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      status: row.status,
      revision: row.revision,
      values: row.values as LockedContract["values"],
      templateVersion: {
        id: row.template_version_id,
        fields: canonicalTemplateDefinition(row.definition).fields,
      },
    };
  }

  async persistActivation(input: ActivationPersistence): Promise<void> {
    await this.persistContract(input.contract);
    await this.persistHistory(input.history);
    await this.transaction.contractActivationOutbox.create({
      data: input.event,
    });
  }

  async persistClosure(input: ClosurePersistence): Promise<void> {
    await this.persistContract(input.contract);
    await this.persistHistory(input.history);
  }

  async persistDraftEdit(input: DraftEditPersistence): Promise<void> {
    await this.transaction.contract.update({
      where: { id: input.contract.id, tenantId: input.contract.tenantId },
      data: {
        values: input.contract.values as Prisma.InputJsonValue,
        revision: input.contract.revision,
      },
    });
    await this.persistHistory(input.history);
  }

  private async persistContract(input: {
    id: string;
    tenantId: string;
    status: "ACTIVE" | "CLOSED";
    revision: number;
  }): Promise<void> {
    await this.transaction.contract.update({
      where: { id: input.id, tenantId: input.tenantId },
      data: {
        status: input.status,
        revision: input.revision,
      },
    });
  }

  private async persistHistory(
    input:
      | ActivationPersistence["history"]
      | ClosurePersistence["history"]
      | DraftEditPersistence["history"],
  ): Promise<void> {
    await this.transaction.contractHistory.create({
      data: {
        id: input.id,
        tenantId: input.tenantId,
        contractId: input.contractId,
        actorId: input.actorId,
        action: input.action,
        revision: input.revision,
        occurredAt: input.occurredAt,
        beforeSnapshot: input.before as Prisma.InputJsonValue,
        afterSnapshot: input.after as Prisma.InputJsonValue,
      },
    });
  }
}

@Injectable()
export class PrismaContractMutationTransactions implements ContractMutationTransactions {
  constructor(private readonly database: DatabaseService) {}

  run<T>(
    operation: (transaction: ContractMutationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.client.$transaction((transaction) =>
      operation(new PrismaContractMutationTransaction(transaction)),
    );
  }
}
