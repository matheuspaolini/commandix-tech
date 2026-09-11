import {
  CONTRACT_ACTIVATED_EVENT_TYPE,
  CONTRACT_ACTIVATED_SCHEMA_VERSION,
} from "@commandix/contract-events";
import type { ContractMutationTransactions } from "@/contract/application/edit-draft-values/contract-mutation";
import type { ContractSnapshot } from "@/contract/domain/contract-snapshot";
import {
  ContractEntity,
  ContractIdentifier,
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
      const status = next.status;
      const revision = next.revision;
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
      if (status !== "ACTIVE")
        throw new Error("Contract transition produced an invalid target");

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
