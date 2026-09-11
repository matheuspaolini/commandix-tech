import {
  resolveContractValues,
  type ContractValues,
} from "@/modules/contract/domain/contract-values";
import type { ContractSnapshot } from "@/modules/contract/domain/contract-snapshot";
import {
  ContractEntity,
  ContractIdentifier,
  HistoryEntity,
  HistoryIdentifier,
  TemplateVersionEntity,
  TenantIdentifier,
} from "@/modules/contract/domain/entities";

export type NewContract = ContractSnapshot & {
  id: string;
  tenantId: string;
  createdAt: Date;
};
export type CreationHistory = {
  id: string;
  tenantId: string;
  contractId: string;
  actorId: string;
  action: "CREATED";
  revision: 1;
  occurredAt: Date;
  before: null;
  after: ContractSnapshot;
};
export type ActiveTemplateForCreation = TemplateVersionEntity;
export interface ContractCreationTransaction {
  findActiveTemplateForUpdate(
    tenantId: string,
  ): Promise<ActiveTemplateForCreation | null>;
  insertContractAndHistory(input: {
    contract: NewContract;
    history: CreationHistory;
  }): Promise<void>;
}
export interface ContractCreationTransactions {
  run<T>(
    operation: (transaction: ContractCreationTransaction) => Promise<T>,
  ): Promise<T>;
}
export interface ContractClock {
  now(): Date;
}
export interface ContractIdGenerator {
  next(): string;
}
export type CreateContractCommand = {
  tenantId: string;
  actorId: string;
  suppliedValues: Record<string, unknown>;
};
export type CreatedContract = {
  id: string;
  status: "DRAFT";
  revision: 1;
  templateVersionId: string;
};
export class ActiveTemplateRequired extends Error {}

const SYSTEM_CLOCK: ContractClock = { now: () => new Date() };
const UUIDS: ContractIdGenerator = { next: () => crypto.randomUUID() };

export class CreateContract {
  constructor(
    private readonly transactions: ContractCreationTransactions,
    private readonly clock: ContractClock = SYSTEM_CLOCK,
    private readonly ids: ContractIdGenerator = UUIDS,
  ) {}

  execute(command: CreateContractCommand): Promise<CreatedContract> {
    return this.transactions.run(async (transaction) => {
      const template = await transaction.findActiveTemplateForUpdate(
        command.tenantId,
      );
      if (!template) throw new ActiveTemplateRequired();
      const values = resolveContractValues(
        template.definitionForPresentation(),
        command.suppliedValues,
      );
      const occurredAt = this.clock.now();
      const contract = ContractEntity.create({
        id: ContractIdentifier.from(this.ids.next()),
        tenantId: TenantIdentifier.from(command.tenantId),
        templateVersionId: template.id,
        values,
      });
      const contractSnapshot = contract.snapshot();
      const history = HistoryEntity.create({
        id: HistoryIdentifier.from(this.ids.next()),
        tenantId: contract.tenantId,
        contractId: contract.id,
        revision: contract.revision,
      }).envelope();
      const after: ContractSnapshot = {
        status: contractSnapshot.status,
        revision: 1,
        values: contractSnapshot.values,
        templateVersionId: contractSnapshot.templateVersionId,
      };
      await transaction.insertContractAndHistory({
        contract: {
          ...after,
          id: contractSnapshot.id,
          tenantId: contractSnapshot.tenantId,
          createdAt: occurredAt,
        },
        history: {
          ...history,
          actorId: command.actorId,
          action: "CREATED",
          revision: 1,
          occurredAt,
          before: null,
          after,
        },
      });
      return {
        id: contractSnapshot.id,
        status: "DRAFT",
        revision: 1,
        templateVersionId: contractSnapshot.templateVersionId,
      };
    });
  }
}

export const CONTRACT_CREATION_TRANSACTIONS = Symbol(
  "CONTRACT_CREATION_TRANSACTIONS",
);
