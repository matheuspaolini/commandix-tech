import type { ContractMutationTransactions } from "@/contract/application/edit-draft-values/contract-mutation";
import {
  ContractNotFound,
  ContractRevisionConflict,
  ContractStatusConflict,
} from "@/contract/domain/contract-errors";
import type { ContractSnapshot } from "@/contract/domain/contract-snapshot";
import {
  contractValuesEqual,
  resolveDraftEditValues,
} from "@/contract/domain/contract-values";
import type { ContractDetail } from "@/contract/application/read-contract-detail/read-contract-detail";
import {
  ContractEntity,
  ContractIdentifier,
  TemplateVersionIdentifier,
  TenantIdentifier,
} from "@/contract/domain/entities";

export {
  ContractNotFound,
  ContractRevisionConflict,
  ContractStatusConflict,
} from "@/contract/domain/contract-errors";

export type EditDraftValuesCommand = {
  tenantId: string;
  actorId: string;
  contractId: string;
  expectedRevision: number;
  suppliedValues: unknown;
  clearedKeys: readonly string[];
};

export interface EditClock {
  now(): Date;
}

export interface EditIdGenerator {
  next(): string;
}

const SYSTEM_CLOCK: EditClock = { now: () => new Date() };
const UUIDS: EditIdGenerator = { next: () => crypto.randomUUID() };

export class EditDraftValues {
  constructor(
    private readonly transactions: ContractMutationTransactions,
    private readonly clock: EditClock = SYSTEM_CLOCK,
    private readonly ids: EditIdGenerator = UUIDS,
  ) {}

  execute(command: EditDraftValuesCommand): Promise<ContractDetail> {
    return this.transactions.run(async (transaction) => {
      const current = await transaction.findForUpdate(command);
      if (!current) throw new ContractNotFound();
      if (current.revision !== command.expectedRevision)
        throw new ContractRevisionConflict();
      if (current.status !== "DRAFT") throw new ContractStatusConflict();

      const values = resolveDraftEditValues({
        definition: { fields: current.templateVersion.fields },
        supplied: command.suppliedValues,
        clearedKeys: command.clearedKeys,
      });
      const currentDetail: ContractDetail = {
        id: current.id,
        status: current.status,
        revision: current.revision,
        values: current.values,
        templateVersion: current.templateVersion,
      };
      if (contractValuesEqual(current.values, values)) return currentDetail;

      const next = ContractEntity.reconstitute({
        id: ContractIdentifier.from(current.id),
        tenantId: TenantIdentifier.from(current.tenantId),
        templateVersionId: TemplateVersionIdentifier.from(
          current.templateVersion.id,
        ),
        status: current.status,
        revision: current.revision,
        values: current.values,
      }).withDraftValues(values);
      const revision = next.revision;
      const occurredAt = this.clock.now();
      const before: ContractSnapshot = {
        status: current.status,
        revision: current.revision,
        values: current.values,
        templateVersionId: current.templateVersion.id,
      };
      const after: ContractSnapshot = { ...before, revision, values };

      await transaction.persistDraftEdit({
        contract: {
          id: current.id,
          tenantId: current.tenantId,
          revision,
          values,
        },
        history: {
          id: this.ids.next(),
          tenantId: current.tenantId,
          contractId: current.id,
          actorId: command.actorId,
          action: "EDITED",
          revision,
          occurredAt,
          before,
          after,
        },
      });

      return { ...currentDetail, revision, values };
    });
  }
}
