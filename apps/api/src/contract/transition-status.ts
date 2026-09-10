import {
  CONTRACT_ACTIVATED_EVENT_TYPE,
  CONTRACT_ACTIVATED_SCHEMA_VERSION,
} from "@commandix/contract-events";
import type { ContractMutationTransactions } from "./contract-mutation";
import type { ContractSnapshot } from "./contract-snapshot";
import {
  ContractNotFound,
  ContractRevisionConflict,
  ContractStatusConflict,
} from "./contract-errors";
import type { ContractDetail, ContractStatus } from "./read-contract-detail";

export {
  ContractNotFound,
  ContractRevisionConflict,
  ContractStatusConflict,
} from "./contract-errors";

export class ContractLifecycle {
  constructor(readonly status: ContractStatus) {}

  transitionTo(target: ContractStatus): TransitionTarget {
    if (this.status === "DRAFT" && target === "ACTIVE") return "ACTIVE";
    if (this.status === "ACTIVE" && target === "CLOSED") return "CLOSED";
    throw new ContractStatusConflict();
  }
}

export type TransitionTarget = "ACTIVE" | "CLOSED";

type TransitionCommandContext = {
  tenantId: string;
  actorId: string;
  contractId: string;
  expectedRevision: number;
  correlationId: string;
};

export type TransitionStatusCommand = TransitionCommandContext &
  ({ targetStatus: "ACTIVE" } | { targetStatus: "CLOSED" });

export type TransitionStatusResult =
  | { targetStatus: "ACTIVE"; contract: ContractDetail; eventId: string }
  | { targetStatus: "CLOSED"; contract: ContractDetail };

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
    private readonly transactions: ContractMutationTransactions,
    private readonly clock: TransitionClock = SYSTEM_CLOCK,
    private readonly ids: TransitionIdGenerator = UUIDS,
  ) {}

  execute(command: TransitionStatusCommand): Promise<TransitionStatusResult> {
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
      const before: ContractSnapshot = {
        status: current.status,
        revision: current.revision,
        values: current.values,
        templateVersionId: current.templateVersion.id,
      };
      const after: ContractSnapshot = { ...before, status, revision };

      const contract: ContractDetail = {
        id: current.id,
        status,
        revision,
        values: current.values,
        templateVersion: current.templateVersion,
      };
      const history = {
        id: historyId,
        tenantId: current.tenantId,
        contractId: current.id,
        actorId: command.actorId,
        revision,
        occurredAt,
        before,
        after,
      };

      if (status === "CLOSED") {
        await transaction.persistClosure({
          contract: {
            id: current.id,
            tenantId: current.tenantId,
            status,
            revision,
          },
          history: { ...history, action: "CLOSED" },
        });
        return { targetStatus: "CLOSED", contract };
      }

      const eventId = this.ids.next();
      await transaction.persistActivation({
        contract: {
          id: current.id,
          tenantId: current.tenantId,
          status,
          revision,
        },
        history: { ...history, action: "ACTIVATED" },
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

      return { targetStatus: "ACTIVE", contract, eventId };
    });
  }
}
