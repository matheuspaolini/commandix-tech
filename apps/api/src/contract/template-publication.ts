import type { ActiveTemplate } from "./active-template.repository";
import {
  canonicalTemplateDefinition,
  templateDefinitionsEqual,
  type TemplateDefinition,
} from "./template-definition";

export type LockedLogicalTemplate = {
  id: string;
  tenantId: string;
  revision: number;
  activeVersion: {
    id: string;
    definition: TemplateDefinition;
  };
};

export interface TemplatePublicationTransaction {
  lockTenant(tenantId: string): Promise<boolean>;
  findLogicalTemplateForUpdate(
    tenantId: string,
  ): Promise<LockedLogicalTemplate | null>;
  createInitial(input: {
    tenantId: string;
    definition: TemplateDefinition;
  }): Promise<ActiveTemplate>;
  publishNext(input: {
    logicalTemplateId: string;
    tenantId: string;
    previousRevision: number;
    nextRevision: number;
    definition: TemplateDefinition;
  }): Promise<ActiveTemplate>;
}

export interface TemplatePublicationTransactions {
  run<T>(
    operation: (transaction: TemplatePublicationTransaction) => Promise<T>,
  ): Promise<T>;
}

export type PutActiveTemplateCommand = {
  tenantId: string;
  actorId: string;
  expectedRevision: number;
  definition: unknown;
};

export type TemplatePublicationOutcome = "CREATED" | "PUBLISHED" | "UNCHANGED";

export type PutActiveTemplateResult = {
  outcome: TemplatePublicationOutcome;
  template: ActiveTemplate;
};

export class TemplateRevisionConflict extends Error {}

export class PutActiveTemplate {
  constructor(private readonly transactions: TemplatePublicationTransactions) {}

  execute(command: PutActiveTemplateCommand): Promise<PutActiveTemplateResult> {
    return this.transactions.run(async (transaction) => {
      const tenantExists = await transaction.lockTenant(command.tenantId);
      if (!tenantExists) throw new Error("Authenticated Tenant is missing");

      const current = await transaction.findLogicalTemplateForUpdate(
        command.tenantId,
      );
      if (!revisionMatches(current, command.expectedRevision))
        throw new TemplateRevisionConflict();

      const definition = canonicalTemplateDefinition(command.definition);
      if (!current) {
        const template = await transaction.createInitial({
          tenantId: command.tenantId,
          definition,
        });
        return { outcome: "CREATED", template };
      }

      if (
        templateDefinitionsEqual(current.activeVersion.definition, definition)
      ) {
        return { outcome: "UNCHANGED", template: activeTemplate(current) };
      }

      const template = await transaction.publishNext({
        logicalTemplateId: current.id,
        tenantId: current.tenantId,
        previousRevision: current.revision,
        nextRevision: current.revision + 1,
        definition,
      });
      return { outcome: "PUBLISHED", template };
    });
  }
}

function revisionMatches(
  current: LockedLogicalTemplate | null,
  expectedRevision: number,
): boolean {
  return current
    ? expectedRevision === current.revision
    : expectedRevision === 0;
}

function activeTemplate(current: LockedLogicalTemplate): ActiveTemplate {
  return {
    logicalTemplateId: current.id,
    templateVersionId: current.activeVersion.id,
    revision: current.revision,
    fields: current.activeVersion.definition.fields,
  };
}

export const TEMPLATE_PUBLICATION_TRANSACTIONS = Symbol(
  "TEMPLATE_PUBLICATION_TRANSACTIONS",
);
