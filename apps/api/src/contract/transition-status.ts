import {
  CONTRACT_ACTIVATED_EVENT_TYPE,
  CONTRACT_ACTIVATED_SCHEMA_VERSION,
} from "@commandix/contract-events";
import {
  ContractNotFound,
  ContractRevisionConflict,
  ContractStatusConflict,
} from "./contract-errors";
import type { ContractSnapshot } from "./contract-snapshot";
import type { ContractValues } from "./contract-values";
import type { ContractDetail, ContractStatus } from "./read-contract-detail";

export {
  ContractNotFound,
  ContractRevisionConflict,
  ContractStatusConflict,
} from "./contract-errors";

export class ContractLifecycle {
  constructor(readonly status: ContractStatus) {}

  transitionTo(target: "ACTIVE"): "ACTIVE" {
    if (this.status === "DRAFT" && target === "ACTIVE") return "ACTIVE";
    throw new ContractStatusConflict();
  }
}

export type LockedContract = {
  id: string;
  tenantId: string;
  status: ContractStatus;
  revision: number;
  values: ContractValues;
  templateVersion: ContractDetail["templateVersion"];
};

export type ActivationPersistence = {
  contract: {
    id: string;
    tenantId: string;
    status: "ACTIVE";
    revision: number;
  };
  history: {
    id: string;
    tenantId: string;
    contractId: string;
    actorId: string;
    action: "ACTIVATED";
    revision: number;
    occurredAt: Date;
    before: ContractSnapshot;
    after: ContractSnapshot;
  };
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

export interface ContractTransitionTransaction {
  findForUpdate(input: {
    tenantId: string;
    contractId: string;
  }): Promise<LockedContract | null>;
  persistActivation(input: ActivationPersistence): Promise<void>;
}

export interface ContractTransitionTransactions {
  run<T>(
    operation: (transaction: ContractTransitionTransaction) => Promise<T>,
  ): Promise<T>;
}

export type TransitionStatusCommand = {
  tenantId: string;
  actorId: string;
  contractId: string;
  expectedRevision: number;
  targetStatus: "ACTIVE";
  correlationId: string;
};

export type TransitionedContract = ContractDetail & { eventId: string };

export interface TransitionClock {
  now(): Date;
}

export interface TransitionIdGenerator {
  next(): string;
}

const SYSTEM_CLOCK: TransitionClock = { now: () => new Date() };
const UUIDS: TransitionIdGenerator = { next: () => crypto.randomUUID() };

export class TransitionStatus {
  constructor(
    private readonly transactions: ContractTransitionTransactions,
    private readonly clock: TransitionClock = SYSTEM_CLOCK,
    private readonly ids: TransitionIdGenerator = UUIDS,
  ) {}

  execute(command: TransitionStatusCommand): Promise<TransitionedContract> {
    return this.transactions.run(async (transaction) => {
      const current = await transaction.findForUpdate(command);
      if (!current) throw new ContractNotFound();
      if (current.revision !== command.expectedRevision)
        throw new ContractRevisionConflict();
      const status = new ContractLifecycle(current.status).transitionTo(
        command.targetStatus,
      );
      const revision = current.revision + 1;
      const occurredAt = this.clock.now();
      const historyId = this.ids.next();
      const eventId = this.ids.next();
      const before: ContractSnapshot = {
        status: current.status,
        revision: current.revision,
        values: current.values,
        templateVersionId: current.templateVersion.id,
      };
      const after: ContractSnapshot = { ...before, status, revision };

      await transaction.persistActivation({
        contract: {
          id: current.id,
          tenantId: current.tenantId,
          status,
          revision,
        },
        history: {
          id: historyId,
          tenantId: current.tenantId,
          contractId: current.id,
          actorId: command.actorId,
          action: "ACTIVATED",
          revision,
          occurredAt,
          before,
          after,
        },
        event: {
          eventId,
          eventType: CONTRACT_ACTIVATED_EVENT_TYPE,
          schemaVersion: CONTRACT_ACTIVATED_SCHEMA_VERSION,
          tenantId: current.tenantId,
          contractId: current.id,
          activationRevision: revision,
          occurredAt,
          correlationId: command.correlationId,
          nextAttemptAt: occurredAt,
        },
      });

      return {
        id: current.id,
        status,
        revision,
        values: current.values,
        templateVersion: current.templateVersion,
        eventId,
      };
    });
  }
}

export const CONTRACT_TRANSITION_TRANSACTIONS = Symbol(
  "CONTRACT_TRANSITION_TRANSACTIONS",
);
