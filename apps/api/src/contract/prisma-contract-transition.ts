import { Prisma, type PrismaClient } from "@commandix/database";
import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database";
import { canonicalTemplateDefinition } from "./template-definition";
import type {
  ActivationPersistence,
  ContractTransitionTransaction,
  ContractTransitionTransactions,
  LockedContract,
} from "./transition-status";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

class PrismaContractTransitionTransaction implements ContractTransitionTransaction {
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
    await this.transaction.contract.update({
      where: { id: input.contract.id },
      data: {
        status: input.contract.status,
        revision: input.contract.revision,
      },
    });
    await this.transaction.contractHistory.create({
      data: {
        id: input.history.id,
        tenantId: input.history.tenantId,
        contractId: input.history.contractId,
        actorId: input.history.actorId,
        action: input.history.action,
        revision: input.history.revision,
        occurredAt: input.history.occurredAt,
        beforeSnapshot: input.history.before as Prisma.InputJsonValue,
        afterSnapshot: input.history.after as Prisma.InputJsonValue,
      },
    });
    await this.transaction.contractActivationOutbox.create({
      data: input.event,
    });
  }
}

@Injectable()
export class PrismaContractTransitionTransactions implements ContractTransitionTransactions {
  constructor(private readonly database: DatabaseService) {}

  run<T>(
    operation: (transaction: ContractTransitionTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.client.$transaction((transaction) =>
      operation(new PrismaContractTransitionTransaction(transaction)),
    );
  }
}
