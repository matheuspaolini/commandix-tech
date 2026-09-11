import { Prisma, type PrismaClient } from "@commandix/database";
import { Injectable } from "@nestjs/common";
import { DatabaseService } from "@/platform/database";
import { canonicalTemplateDefinition } from "@/modules/contract/domain/template-definition";
import type {
  DraftEditPersistence,
  DraftEditTransaction,
  DraftEditTransactions,
  LockedDraftContract,
} from "@/modules/contract/application/edit-draft-values/draft-edit-transaction";
import type {
  DraftMigrationPersistence,
  DraftMigrationTransaction,
  DraftMigrationTransactions,
} from "@/modules/contract/application/migrate-draft/draft-migration-transaction";
import type {
  ActivationTransaction,
  ActivationTransactions,
  ActivationPersistence,
  ClosureTransaction,
  ClosureTransactions,
  ClosurePersistence,
  LockedStatusTransitionContract,
} from "@/modules/contract/application/transition-status/status-transition-transaction";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

class PrismaDraftEditTransaction implements DraftEditTransaction {
  constructor(private readonly transaction: TransactionClient) {}

  async findForUpdate(input: {
    tenantId: string;
    contractId: string;
  }): Promise<LockedDraftContract | null> {
    return findLockedContract(this.transaction, input);
  }

  async persistDraftEdit(input: DraftEditPersistence): Promise<void> {
    await this.transaction.contract.update({
      where: { id: input.contract.id, tenantId: input.contract.tenantId },
      data: {
        values: input.contract.values as Prisma.InputJsonValue,
        revision: input.contract.revision,
      },
    });
    await persistHistory(this.transaction, input.history);
  }
}

class PrismaDraftMigrationTransaction implements DraftMigrationTransaction {
  constructor(private readonly transaction: TransactionClient) {}

  async loadForMigration(input: {
    tenantId: string;
    contractId: string;
    targetVersionId: string;
  }) {
    const activeTemplateVersionId = await lockActiveTemplateForUpdate(
      this.transaction,
      input.tenantId,
    );
    const contract = await findLockedContract(this.transaction, input);
    if (!contract) return null;
    const targetTemplateVersion = await findTemplateVersion(
      this.transaction,
      input.tenantId,
      input.targetVersionId,
    );
    return { contract, activeTemplateVersionId, targetTemplateVersion };
  }

  async persistMigration(input: DraftMigrationPersistence): Promise<void> {
    await this.transaction.contract.update({
      where: { id: input.contract.id, tenantId: input.contract.tenantId },
      data: {
        templateVersionId: input.contract.templateVersionId,
        values: input.contract.values as Prisma.InputJsonValue,
        revision: input.contract.revision,
      },
    });
    await persistHistory(this.transaction, input.history);
  }
}

class PrismaContractActivationTransaction implements ActivationTransaction {
  constructor(private readonly transaction: TransactionClient) {}

  async findForUpdate(input: {
    tenantId: string;
    contractId: string;
  }): Promise<LockedStatusTransitionContract | null> {
    return findLockedContract(this.transaction, input);
  }

  async persistActivation(input: ActivationPersistence): Promise<void> {
    await persistContract(this.transaction, input.contract);
    await persistHistory(this.transaction, input.history);
    await this.transaction.contractActivationOutbox.create({
      data: input.event,
    });
  }
}

class PrismaContractClosureTransaction implements ClosureTransaction {
  constructor(private readonly transaction: TransactionClient) {}

  async findForUpdate(input: {
    tenantId: string;
    contractId: string;
  }): Promise<LockedStatusTransitionContract | null> {
    return findLockedContract(this.transaction, input);
  }

  async persistClosure(input: ClosurePersistence): Promise<void> {
    await persistContract(this.transaction, input.contract);
    await persistHistory(this.transaction, input.history);
  }
}

async function persistContract(
  transaction: TransactionClient,
  input: {
    id: string;
    tenantId: string;
    status: "ACTIVE" | "CLOSED";
    revision: number;
  },
): Promise<void> {
  await transaction.contract.update({
    where: { id: input.id, tenantId: input.tenantId },
    data: {
      status: input.status,
      revision: input.revision,
    },
  });
}

async function persistHistory(
  transaction: TransactionClient,
  input:
    | ActivationPersistence["history"]
    | ClosurePersistence["history"]
    | DraftEditPersistence["history"]
    | DraftMigrationPersistence["history"],
): Promise<void> {
  await transaction.contractHistory.create({
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

@Injectable()
export class PrismaContractDraftEditTransactions implements DraftEditTransactions {
  constructor(private readonly database: DatabaseService) {}

  run<T>(
    operation: (transaction: DraftEditTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.client.$transaction((transaction) =>
      operation(new PrismaDraftEditTransaction(transaction)),
    );
  }
}

@Injectable()
export class PrismaContractDraftMigrationTransactions implements DraftMigrationTransactions {
  constructor(private readonly database: DatabaseService) {}

  run<T>(
    operation: (transaction: DraftMigrationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.client.$transaction((transaction) =>
      operation(new PrismaDraftMigrationTransaction(transaction)),
    );
  }
}

@Injectable()
export class PrismaContractActivationTransactions implements ActivationTransactions {
  constructor(private readonly database: DatabaseService) {}

  run<T>(
    operation: (transaction: ActivationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.client.$transaction((transaction) =>
      operation(new PrismaContractActivationTransaction(transaction)),
    );
  }
}

@Injectable()
export class PrismaContractClosureTransactions implements ClosureTransactions {
  constructor(private readonly database: DatabaseService) {}

  run<T>(
    operation: (transaction: ClosureTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.client.$transaction((transaction) =>
      operation(new PrismaContractClosureTransaction(transaction)),
    );
  }
}

async function findLockedContract(
  transaction: TransactionClient,
  input: { tenantId: string; contractId: string },
): Promise<LockedStatusTransitionContract | null> {
  const rows = await transaction.$queryRaw<
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
    values: row.values as LockedStatusTransitionContract["values"],
    templateVersion: {
      id: row.template_version_id,
      fields: canonicalTemplateDefinition(row.definition).fields,
    },
  };
}

async function lockActiveTemplateForUpdate(
  transaction: TransactionClient,
  tenantId: string,
): Promise<string | null> {
  const rows = await transaction.$queryRaw<
    Array<{ active_version_id: string | null }>
  >`SELECT "active_version_id" FROM "logical_templates"
    WHERE "tenant_id" = ${tenantId}::uuid
    FOR UPDATE`;
  return rows[0]?.active_version_id ?? null;
}

async function findTemplateVersion(
  transaction: TransactionClient,
  tenantId: string,
  templateVersionId: string,
) {
  const version = await transaction.templateVersion.findFirst({
    where: { id: templateVersionId, tenantId },
    select: { id: true, definition: true },
  });
  if (!version) return null;
  return {
    id: version.id,
    fields: canonicalTemplateDefinition(version.definition).fields,
  };
}
