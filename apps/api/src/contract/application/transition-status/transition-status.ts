import {
  CONTRACT_ACTIVATED_EVENT_TYPE,
  CONTRACT_ACTIVATED_SCHEMA_VERSION,
} from "@commandix/contract-events";
import type {
  ActivationTransaction,
  ActivationTransactions,
  ClosureTransaction,
  ClosureTransactions,
  LockedStatusTransitionReader,
} from "@/contract/application/transition-status/status-transition-transaction";
import type { ContractSnapshot } from "@/contract/domain/contract-snapshot";
import {
  ContractEntity,
  ContractIdentifier,
  ActivationOutboxEventEntity,
  ActivationOutboxEventIdentifier,
  HistoryEntity,
  HistoryIdentifier,
  TemplateVersionIdentifier,
  TenantIdentifier,
} from "@/contract/domain/entities";
import {
  ContractNotFound,
  ContractRevisionConflict,
  ContractStatusConflict,
} from "@/contract/domain/contract-errors";
import type {
  ContractDetail,
  ContractStatus,
} from "@/contract/application/read-contract-detail/read-contract-detail";

export {
  ContractNotFound,
  ContractRevisionConflict,
  ContractStatusConflict,
} from "@/contract/domain/contract-errors";

export class ContractLifecycle {
  constructor(readonly status: ContractStatus) {}

  transitionTo(target: ContractStatus): TransitionTarget {
    const transitioned = ContractEntity.reconstitute({
      id: ContractIdentifier.from("lifecycle"),
      tenantId: TenantIdentifier.from("lifecycle"),
      templateVersionId: TemplateVersionIdentifier.from("lifecycle"),
      status: this.status,
      revision: 1,
      values: {},
    }).transitionTo(target).status;
    if (transitioned !== "ACTIVE" && transitioned !== "CLOSED")
      throw new Error("Contract transition produced an invalid target");
    return transitioned;
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
    private readonly activations: ActivationTransactions,
    private readonly closures: ClosureTransactions,
    private readonly clock: TransitionClock = SYSTEM_CLOCK,
    private readonly ids: TransitionIdGenerator = UUIDS,
  ) {}

  execute(command: TransitionStatusCommand): Promise<TransitionStatusResult> {
    if (command.targetStatus === "ACTIVE")
      return this.activations.run((transaction) =>
        this.activate(transaction, command),
      );
    return this.closures.run((transaction) => this.close(transaction, command));
  }

  private async activate(
    transaction: ActivationTransaction,
    command: TransitionStatusCommand & { targetStatus: "ACTIVE" },
  ): Promise<TransitionStatusResult> {
    const transition = await this.transition(transaction, command);
    const event = ActivationOutboxEventEntity.create({
      eventId: ActivationOutboxEventIdentifier.from(this.ids.next()),
      tenantId: TenantIdentifier.from(transition.current.tenantId),
      contractId: ContractIdentifier.from(transition.current.id),
      activationRevision: transition.revision,
    }).activation();
    await transaction.persistActivation({
      contract: {
        id: transition.current.id,
        tenantId: transition.current.tenantId,
        status: "ACTIVE",
        revision: transition.revision,
      },
      history: { ...transition.history, action: "ACTIVATED" },
      event: {
        ...event,
        eventType: CONTRACT_ACTIVATED_EVENT_TYPE,
        schemaVersion: CONTRACT_ACTIVATED_SCHEMA_VERSION,
        occurredAt: transition.occurredAt,
        correlationId: command.correlationId,
        nextAttemptAt: transition.occurredAt,
      },
    });
    return {
      targetStatus: "ACTIVE",
      contract: transition.contract,
      eventId: event.eventId,
    };
  }

  private async close(
    transaction: ClosureTransaction,
    command: TransitionStatusCommand & { targetStatus: "CLOSED" },
  ): Promise<TransitionStatusResult> {
    const transition = await this.transition(transaction, command);
    await transaction.persistClosure({
      contract: {
        id: transition.current.id,
        tenantId: transition.current.tenantId,
        status: "CLOSED",
        revision: transition.revision,
      },
      history: { ...transition.history, action: "CLOSED" },
    });
    return { targetStatus: "CLOSED", contract: transition.contract };
  }

  private async transition(
    transaction: LockedStatusTransitionReader,
    command: TransitionStatusCommand,
  ) {
    const current = await transaction.findForUpdate(command);
    if (!current) throw new ContractNotFound();
    if (current.revision !== command.expectedRevision)
      throw new ContractRevisionConflict();
    const next = ContractEntity.reconstitute({
      id: ContractIdentifier.from(current.id),
      tenantId: TenantIdentifier.from(current.tenantId),
      templateVersionId: TemplateVersionIdentifier.from(
        current.templateVersion.id,
      ),
      status: current.status,
      revision: current.revision,
      values: current.values,
    }).transitionTo(command.targetStatus);
    const revision = next.revision;
    const occurredAt = this.clock.now();
    const before: ContractSnapshot = {
      status: current.status,
      revision: current.revision,
      values: current.values,
      templateVersionId: current.templateVersion.id,
    };
    const after: ContractSnapshot = {
      ...before,
      status: next.status,
      revision,
    };
    return {
      current,
      revision,
      occurredAt,
      contract: {
        id: current.id,
        status: next.status,
        revision,
        values: current.values,
        templateVersion: current.templateVersion,
      } satisfies ContractDetail,
      history: {
        ...HistoryEntity.create({
          id: HistoryIdentifier.from(this.ids.next()),
          tenantId: TenantIdentifier.from(current.tenantId),
          contractId: ContractIdentifier.from(current.id),
          revision,
        }).envelope(),
        actorId: command.actorId,
        revision,
        occurredAt,
        before,
        after,
      },
    };
  }
}
