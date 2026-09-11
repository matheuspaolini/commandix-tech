import {
  CONTRACT_ACTIVATED_EVENT_TYPE,
  CONTRACT_ACTIVATED_SCHEMA_VERSION,
} from "@commandix/contract-events";
import type { ContractSnapshot } from "@/contract/domain/contract-snapshot";
import type { ContractValues } from "@/contract/domain/contract-values";
import type { ContractDetail, ContractStatus } from "@/contract/application/read-contract-detail/read-contract-detail";

export type LockedContract = {
  id: string;
  tenantId: string;
  status: ContractStatus;
  revision: number;
  values: ContractValues;
  templateVersion: ContractDetail["templateVersion"];
};

type HistoryPersistence<Action extends "ACTIVATED" | "CLOSED" | "EDITED"> = {
  id: string;
  tenantId: string;
  contractId: string;
  actorId: string;
  action: Action;
  revision: number;
  occurredAt: Date;
  before: ContractSnapshot;
  after: ContractSnapshot;
};

export type ActivationPersistence = {
  contract: {
    id: string;
    tenantId: string;
    status: "ACTIVE";
    revision: number;
  };
  history: HistoryPersistence<"ACTIVATED">;
  event: {
    eventId: string;
    eventType: typeof CONTRACT_ACTIVATED_EVENT_TYPE;
    schemaVersion: typeof CONTRACT_ACTIVATED_SCHEMA_VERSION;
    tenantId: string;
    contractId: string;
    activationRevision: number;
    occurredAt: Date;
    correlationId: string;
    nextAttemptAt: Date;
  };
};

export type ClosurePersistence = {
  contract: {
    id: string;
    tenantId: string;
    status: "CLOSED";
    revision: number;
  };
  history: HistoryPersistence<"CLOSED">;
};

export type DraftEditPersistence = {
  contract: {
    id: string;
    tenantId: string;
    revision: number;
    values: ContractValues;
  };
  history: HistoryPersistence<"EDITED">;
};

export interface ContractMutationTransaction {
  findForUpdate(input: {
    tenantId: string;
    contractId: string;
  }): Promise<LockedContract | null>;
  persistActivation(input: ActivationPersistence): Promise<void>;
  persistClosure(input: ClosurePersistence): Promise<void>;
  persistDraftEdit(input: DraftEditPersistence): Promise<void>;
}

export interface ContractMutationTransactions {
  run<T>(
    operation: (transaction: ContractMutationTransaction) => Promise<T>,
  ): Promise<T>;
}

export const CONTRACT_MUTATION_TRANSACTIONS = Symbol(
  "CONTRACT_MUTATION_TRANSACTIONS",
);
