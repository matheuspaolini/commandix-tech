import type { ContractSnapshot } from "@/modules/contract/domain/contract-snapshot";
import type { ContractValues } from "@/modules/contract/domain/contract-values";
import type { LockedDraftContract } from "@/modules/contract/application/edit-draft-values/draft-edit-transaction";
import type { ContractTemplateVersion } from "@/modules/contract/application/contract-template-version";

export type LockedDraftMigration = {
  contract: LockedDraftContract;
  activeTemplateVersionId: string | null;
  targetTemplateVersion: ContractTemplateVersion | null;
};

export type DraftMigrationPersistence = {
  contract: {
    id: string;
    tenantId: string;
    templateVersionId: string;
    revision: number;
    values: ContractValues;
  };
  history: {
    id: string;
    tenantId: string;
    contractId: string;
    actorId: string;
    action: "MIGRATED";
    revision: number;
    occurredAt: Date;
    before: ContractSnapshot;
    after: ContractSnapshot;
  };
};

export interface DraftMigrationTransaction {
  loadForMigration(input: {
    tenantId: string;
    contractId: string;
    targetVersionId: string;
  }): Promise<LockedDraftMigration | null>;
  persistMigration(input: DraftMigrationPersistence): Promise<void>;
}

export interface DraftMigrationTransactions {
  run<T>(
    operation: (transaction: DraftMigrationTransaction) => Promise<T>,
  ): Promise<T>;
}

export const DRAFT_MIGRATION_TRANSACTIONS = Symbol(
  "DRAFT_MIGRATION_TRANSACTIONS",
);
