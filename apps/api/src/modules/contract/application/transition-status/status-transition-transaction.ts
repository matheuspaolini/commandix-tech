import type { ContractTemplateVersion } from "@/modules/contract/application/contract-template-version";
import type { ContractSnapshot } from "@/modules/contract/domain/contract-snapshot";
import type { ContractValues } from "@/modules/contract/domain/contract-values";
import type { ContractStatus } from "@/modules/contract/domain/entities";

export const CONTRACT_ACTIVATION_EVENT_TYPE = "contract.activated";
export const CONTRACT_ACTIVATION_SCHEMA_VERSION = 1;

export type LockedStatusTransitionContract = {
  id: string;
  tenantId: string;
  status: ContractStatus;
  revision: number;
  values: ContractValues;
  templateVersion: ContractTemplateVersion;
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

export interface LockedStatusTransitionReader {
  findForUpdate(input: {
    tenantId: string;
    contractId: string;
  }): Promise<LockedStatusTransitionContract | null>;
}

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
    eventType: typeof CONTRACT_ACTIVATION_EVENT_TYPE;
    schemaVersion: typeof CONTRACT_ACTIVATION_SCHEMA_VERSION;
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

export interface ActivationTransaction extends LockedStatusTransitionReader {
  persistActivation(input: ActivationPersistence): Promise<void>;
}

export interface ClosureTransaction extends LockedStatusTransitionReader {
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
