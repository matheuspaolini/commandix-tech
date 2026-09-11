import type { ContractDetail } from "@/modules/contract/application/read-contract-detail/read-contract-detail";
import type { DraftMigrationTransactions } from "@/modules/contract/application/migrate-draft/draft-migration-transaction";
import {
  ContractNotFound,
  ContractRevisionConflict,
  ContractStatusConflict,
  TemplateVersionNotActive,
  TemplateVersionNotFound,
} from "@/modules/contract/domain/contract-errors";
import type { ContractSnapshot } from "@/modules/contract/domain/contract-snapshot";
import {
  contractValuesEqual,
  resolveContractValues,
} from "@/modules/contract/domain/contract-values";
import {
  ContractEntity,
  ContractIdentifier,
  HistoryEntity,
  HistoryIdentifier,
  TemplateVersionIdentifier,
  TenantIdentifier,
} from "@/modules/contract/domain/entities";

export {
  ContractNotFound,
  ContractRevisionConflict,
  ContractStatusConflict,
  TemplateVersionNotActive,
  TemplateVersionNotFound,
} from "@/modules/contract/domain/contract-errors";

export type MigrateDraftCommand = {
  tenantId: string;
  actorId: string;
  contractId: string;
  expectedRevision: number;
  targetVersionId: string;
  suppliedValues: unknown;
};

export interface MigrationClock {
  now(): Date;
}

export interface MigrationIdGenerator {
  next(): string;
}

const SYSTEM_CLOCK: MigrationClock = { now: () => new Date() };
const UUIDS: MigrationIdGenerator = { next: () => crypto.randomUUID() };

export class MigrateDraft {
  constructor(
    private readonly transactions: DraftMigrationTransactions,
    private readonly clock: MigrationClock = SYSTEM_CLOCK,
    private readonly ids: MigrationIdGenerator = UUIDS,
  ) {}

  execute(command: MigrateDraftCommand): Promise<ContractDetail> {
    return this.transactions.run(async (transaction) => {
      const current = await transaction.loadForMigration({
        tenantId: command.tenantId,
        contractId: command.contractId,
        targetVersionId: command.targetVersionId,
      });
      if (!current) throw new ContractNotFound();
      if (!current.targetTemplateVersion) throw new TemplateVersionNotFound();
      if (current.contract.revision !== command.expectedRevision)
        throw new ContractRevisionConflict();
      if (current.contract.status !== "DRAFT")
        throw new ContractStatusConflict();
      if (current.activeTemplateVersionId !== command.targetVersionId)
        throw new TemplateVersionNotActive();

      const values = resolveContractValues(
        { fields: current.targetTemplateVersion.fields },
        command.suppliedValues,
      );
      const currentDetail: ContractDetail = {
        id: current.contract.id,
        status: current.contract.status,
        revision: current.contract.revision,
        values: current.contract.values,
        templateVersion: current.contract.templateVersion,
      };
      const sameVersion =
        current.contract.templateVersion.id === command.targetVersionId;
      if (sameVersion && contractValuesEqual(current.contract.values, values))
        return currentDetail;

      const next = ContractEntity.reconstitute({
        id: ContractIdentifier.from(current.contract.id),
        tenantId: TenantIdentifier.from(current.contract.tenantId),
        templateVersionId: TemplateVersionIdentifier.from(
          current.contract.templateVersion.id,
        ),
        status: current.contract.status,
        revision: current.contract.revision,
        values: current.contract.values,
      }).migrateDraft({
        templateVersionId: TemplateVersionIdentifier.from(
          command.targetVersionId,
        ),
        values,
      });
      const occurredAt = this.clock.now();
      const history = HistoryEntity.create({
        id: HistoryIdentifier.from(this.ids.next()),
        tenantId: TenantIdentifier.from(current.contract.tenantId),
        contractId: ContractIdentifier.from(current.contract.id),
        revision: next.revision,
      }).envelope();
      const before: ContractSnapshot = {
        status: current.contract.status,
        revision: current.contract.revision,
        values: current.contract.values,
        templateVersionId: current.contract.templateVersion.id,
      };
      const after: ContractSnapshot = {
        status: next.status,
        revision: next.revision,
        values: next.values,
        templateVersionId: next.templateVersionId.value,
      };

      await transaction.persistMigration({
        contract: {
          id: current.contract.id,
          tenantId: current.contract.tenantId,
          templateVersionId: next.templateVersionId.value,
          revision: next.revision,
          values: next.values,
        },
        history: {
          ...history,
          actorId: command.actorId,
          action: "MIGRATED",
          revision: next.revision,
          occurredAt,
          before,
          after,
        },
      });

      return {
        id: current.contract.id,
        status: next.status,
        revision: next.revision,
        values: next.values,
        templateVersion: current.targetTemplateVersion,
      };
    });
  }
}
