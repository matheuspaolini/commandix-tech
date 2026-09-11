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

export interface StatusTransitionTransaction {
  findForUpdate(input: {
    tenantId: string;
    contractId: string;
  }): Promise<LockedStatusTransitionContract | null>;
  persistActivation(input: ActivationPersistence): Promise<void>;
  persistClosure(input: ClosurePersistence): Promise<void>;
}

export interface StatusTransitionTransactions {
  run<T>(
    operation: (transaction: StatusTransitionTransaction) => Promise<T>,
  ): Promise<T>;
}

export const STATUS_TRANSITION_TRANSACTIONS = Symbol(
  "STATUS_TRANSITION_TRANSACTIONS",
);
