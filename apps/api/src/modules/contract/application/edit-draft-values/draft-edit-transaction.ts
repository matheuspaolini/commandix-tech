import type { ContractDetail } from "@/modules/contract/application/read-contract-detail/read-contract-detail";
import type { ContractSnapshot } from "@/modules/contract/domain/contract-snapshot";
import type { ContractValues } from "@/modules/contract/domain/contract-values";
import type { ContractStatus } from "@/modules/contract/domain/entities";

export type LockedDraftContract = {
  id: string;
  tenantId: string;
  status: ContractStatus;
  revision: number;
  values: ContractValues;
  templateVersion: ContractDetail["templateVersion"];
};

export type DraftEditPersistence = {
  contract: {
    id: string;
    tenantId: string;
    revision: number;
    values: ContractValues;
  };
  history: {
    id: string;
    tenantId: string;
    contractId: string;
    actorId: string;
    action: "EDITED";
    revision: number;
    occurredAt: Date;
    before: ContractSnapshot;
    after: ContractSnapshot;
  };
};

export interface DraftEditTransaction {
  findForUpdate(input: {
    tenantId: string;
    contractId: string;
  }): Promise<LockedDraftContract | null>;
  persistDraftEdit(input: DraftEditPersistence): Promise<void>;
}

export interface DraftEditTransactions {
  run<T>(
    operation: (transaction: DraftEditTransaction) => Promise<T>,
  ): Promise<T>;
}

export const DRAFT_EDIT_TRANSACTIONS = Symbol("DRAFT_EDIT_TRANSACTIONS");
