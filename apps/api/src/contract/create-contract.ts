import type { TemplateDefinition } from "./template-definition";
import { resolveContractValues, type ContractValues } from "./contract-values";

export type ContractSnapshot = {
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  revision: number;
  values: ContractValues;
  templateVersionId: string;
};
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
export type ActiveTemplateForCreation = {
  id: string;
  definition: TemplateDefinition;
};
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
        template.definition,
        command.suppliedValues,
      );
      const occurredAt = this.clock.now();
      const contractId = this.ids.next();
      const after: ContractSnapshot = {
        status: "DRAFT",
        revision: 1,
        values,
        templateVersionId: template.id,
      };
      await transaction.insertContractAndHistory({
        contract: {
          ...after,
          id: contractId,
          tenantId: command.tenantId,
          createdAt: occurredAt,
        },
        history: {
          id: this.ids.next(),
          tenantId: command.tenantId,
          contractId,
          actorId: command.actorId,
          action: "CREATED",
          revision: 1,
          occurredAt,
          before: null,
          after,
        },
      });
      return {
        id: contractId,
        status: "DRAFT",
        revision: 1,
        templateVersionId: template.id,
      };
    });
  }
}

export const CONTRACT_CREATION_TRANSACTIONS = Symbol(
  "CONTRACT_CREATION_TRANSACTIONS",
);
