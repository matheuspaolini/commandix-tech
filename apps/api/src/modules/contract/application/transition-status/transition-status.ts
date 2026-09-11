import type {
  ActivationTransaction,
  ActivationTransactions,
  ClosureTransaction,
  ClosureTransactions,
  LockedStatusTransitionReader,
} from "@/modules/contract/application/transition-status/status-transition-transaction";
import type { ContractTemplateVersion } from "@/modules/contract/application/contract-template-version";
import {
  CONTRACT_ACTIVATION_EVENT_TYPE,
  CONTRACT_ACTIVATION_SCHEMA_VERSION,
} from "@/modules/contract/application/transition-status/status-transition-transaction";
import type { ContractSnapshot } from "@/modules/contract/domain/contract-snapshot";
import {
  ContractEntity,
  ContractIdentifier,
  ActivationOutboxEventEntity,
  ActivationOutboxEventIdentifier,
  HistoryEntity,
  HistoryIdentifier,
  TemplateVersionIdentifier,
  TenantIdentifier,
} from "@/modules/contract/domain/entities";
import type { ContractStatus } from "@/modules/contract/domain/entities";
import {
  ContractNotFound,
  ContractRevisionConflict,
  ContractStatusConflict,
} from "@/modules/contract/domain/contract-errors";

export {
  ContractNotFound,
  ContractRevisionConflict,
  ContractStatusConflict,
} from "@/modules/contract/domain/contract-errors";

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
  | { targetStatus: "ACTIVE"; contract: TransitionedContract; eventId: string }
  | { targetStatus: "CLOSED"; contract: TransitionedContract };

export type TransitionedContract = {
  id: string;
  status: ContractStatus;
  revision: number;
  values: ContractSnapshot["values"];
  templateVersion: ContractTemplateVersion;
};

export interface TransitionClock {
  now(): Date;
}

export interface TransitionIdGenerator {
  next(): string;
}

export class TransitionStatus {
  constructor(
    private readonly activations: ActivationTransactions,
    private readonly closures: ClosureTransactions,
    private readonly clock: TransitionClock,
    private readonly ids: TransitionIdGenerator,
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
        eventType: CONTRACT_ACTIVATION_EVENT_TYPE,
        schemaVersion: CONTRACT_ACTIVATION_SCHEMA_VERSION,
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
      } satisfies TransitionedContract,
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
