import {
  canonicalContractValues,
  type ContractValues,
} from "@/modules/contract/domain/contract-values";
import type { ContractSnapshot } from "@/modules/contract/domain/contract-snapshot";
import { ContractNotFound } from "@/modules/contract/domain/contract-errors";
import {
  canonicalTemplateDefinition,
  type TemplateDefinition,
} from "@/modules/contract/domain/template-definition";
import type { ContractStatus } from "@/modules/contract/application/read-contract-detail/read-contract-detail";

export type ContractHistoryRecord = {
  contract: { id: string; status: ContractStatus; revision: number };
  entries: Array<{
    id: string;
    action: string;
    revision: number;
    occurredAt: Date;
    actor: { id: string; email: string };
    beforeSnapshot: unknown;
    afterSnapshot: unknown;
  }>;
  templateVersions: Array<{ id: string; definition: unknown }>;
};

export type ResolvedHistorySnapshot = {
  status: ContractStatus;
  revision: number;
  values: ContractValues;
  templateVersion: {
    id: string;
    fields: TemplateDefinition["fields"];
  };
};

export type ContractHistory = {
  contract: { id: string; status: ContractStatus; revision: number };
  entries: Array<{
    id: string;
    action: string;
    revision: number;
    occurredAt: string;
    actor: { id: string; email: string };
    before: ResolvedHistorySnapshot | null;
    after: ResolvedHistorySnapshot;
  }>;
};

export interface ContractHistoryRepository {
  findByTenantAndContract(input: {
    tenantId: string;
    contractId: string;
  }): Promise<ContractHistoryRecord | null>;
}

export class ContractHistoryIntegrityError extends Error {}

export class ReadContractHistory {
  constructor(private readonly history: ContractHistoryRepository) {}

  async execute(query: {
    tenantId: string;
    contractId: string;
  }): Promise<ContractHistory> {
    const record = await this.history.findByTenantAndContract(query);
    if (!record) throw new ContractNotFound();

    const definitions = new Map(
      record.templateVersions.map((version) => [
        version.id,
        canonicalTemplateDefinition(version.definition),
      ]),
    );
    let previousRevision = 0;

    return {
      contract: record.contract,
      entries: record.entries.map((entry) => {
        if (entry.revision <= previousRevision)
          throw new ContractHistoryIntegrityError("Invalid revision order");
        previousRevision = entry.revision;
        const before =
          entry.beforeSnapshot === null
            ? null
            : resolveSnapshot(entry.beforeSnapshot, definitions);
        if (entry.action === "CREATED" && before !== null)
          throw new ContractHistoryIntegrityError(
            "Creation cannot have a previous state",
          );
        if (entry.action !== "CREATED" && before === null)
          throw new ContractHistoryIntegrityError(
            "A subsequent change requires a previous state",
          );

        return {
          id: entry.id,
          action: entry.action,
          revision: entry.revision,
          occurredAt: entry.occurredAt.toISOString(),
          actor: entry.actor,
          before,
          after: resolveSnapshot(entry.afterSnapshot, definitions),
        };
      }),
    };
  }
}

function resolveSnapshot(
  input: unknown,
  definitions: Map<string, TemplateDefinition>,
): ResolvedHistorySnapshot {
  const snapshot = canonicalSnapshot(input);
  const definition = definitions.get(snapshot.templateVersionId);
  if (!definition)
    throw new ContractHistoryIntegrityError("Missing Template version");

  return {
    status: snapshot.status,
    revision: snapshot.revision,
    values: snapshot.values,
    templateVersion: {
      id: snapshot.templateVersionId,
      fields: definition.fields,
    },
  };
}

function canonicalSnapshot(input: unknown): ContractSnapshot {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new ContractHistoryIntegrityError("Invalid Contract snapshot");
  const value = input as Record<string, unknown>;
  if (
    !isContractStatus(value.status) ||
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 1 ||
    typeof value.templateVersionId !== "string"
  )
    throw new ContractHistoryIntegrityError("Invalid Contract snapshot");

  try {
    return {
      status: value.status,
      revision: value.revision as number,
      values: canonicalContractValues(value.values),
      templateVersionId: value.templateVersionId,
    };
  } catch {
    throw new ContractHistoryIntegrityError("Invalid Contract snapshot");
  }
}

function isContractStatus(value: unknown): value is ContractStatus {
  return value === "DRAFT" || value === "ACTIVE" || value === "CLOSED";
}

export const CONTRACT_HISTORY_REPOSITORY = Symbol(
  "CONTRACT_HISTORY_REPOSITORY",
);
