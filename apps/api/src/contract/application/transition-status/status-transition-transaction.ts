import {
  CONTRACT_ACTIVATED_EVENT_TYPE,
  CONTRACT_ACTIVATED_SCHEMA_VERSION,
} from "@commandix/contract-events";
import type { ContractDetail } from "@/contract/application/read-contract-detail/read-contract-detail";
import type { ContractSnapshot } from "@/contract/domain/contract-snapshot";
import type { ContractValues } from "@/contract/domain/contract-values";
import type { ContractStatus } from "@/contract/domain/entities";

export type LockedStatusTransitionContract = {
  id: string;
  tenantId: string;
  status: ContractStatus;
  revision: number;
  values: ContractValues;
  templateVersion: ContractDetail["templateVersion"];
};

type HistoryPersistence<Action extends "ACTIVATED" | "CLOSED"> = {
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

type LockedContractReader = {
  findForUpdate(input: {
    tenantId: string;
    contractId: string;
  }): Promise<LockedStatusTransitionContract | null>;
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

export interface ActivationTransaction extends LockedContractReader {
  persistActivation(input: ActivationPersistence): Promise<void>;
}

export interface ClosureTransaction extends LockedContractReader {
  persistClosure(input: ClosurePersistence): Promise<void>;
}

export interface ActivationTransactions {
  run<T>(
    operation: (transaction: ActivationTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface ClosureTransactions {
  run<T>(
    operation: (transaction: ClosureTransaction) => Promise<T>,
  ): Promise<T>;
}

export const ACTIVATION_TRANSACTIONS = Symbol("ACTIVATION_TRANSACTIONS");
export const CLOSURE_TRANSACTIONS = Symbol("CLOSURE_TRANSACTIONS");
