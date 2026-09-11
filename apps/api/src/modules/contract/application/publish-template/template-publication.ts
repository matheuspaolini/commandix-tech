import type { ActiveTemplate } from "@/modules/contract/application/publish-template/active-template.repository";
import {
  canonicalTemplateDefinition,
  templateDefinitionsEqual,
  type TemplateDefinition,
} from "@/modules/contract/domain/template-definition";
import {
  LogicalTemplateEntity,
  LogicalTemplateIdentifier,
  TemplateVersionEntity,
  TemplateVersionIdentifier,
  TenantIdentifier,
} from "@/modules/contract/domain/entities";

export type LockedLogicalTemplate = {
  logicalTemplate: LogicalTemplateEntity;
  activeVersion: TemplateVersionEntity;
};

export interface TemplatePublicationTransaction {
  lockTenant(tenantId: string): Promise<boolean>;
  findLogicalTemplateForUpdate(
    tenantId: string,
  ): Promise<LockedLogicalTemplate | null>;
  createInitial(input: {
    logicalTemplate: LogicalTemplateEntity;
    version: TemplateVersionEntity;
  }): Promise<ActiveTemplate>;
  publishNext(input: {
    logicalTemplate: LogicalTemplateEntity;
    version: TemplateVersionEntity;
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

export interface TemplatePublicationIdGenerator {
  next(): string;
}

const UUIDS: TemplatePublicationIdGenerator = {
  next: () => crypto.randomUUID(),
};

export class PutActiveTemplate {
  constructor(
    private readonly transactions: TemplatePublicationTransactions,
    private readonly ids: TemplatePublicationIdGenerator = UUIDS,
  ) {}

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
        const tenantId = TenantIdentifier.from(command.tenantId);
        const version = TemplateVersionEntity.create({
          id: TemplateVersionIdentifier.from(this.ids.next()),
          logicalTemplateId: LogicalTemplateIdentifier.from(this.ids.next()),
          tenantId,
          definition,
        });
        const logicalTemplate = LogicalTemplateEntity.create({
          id: version.logicalTemplateId,
          tenantId,
          activeVersionId: version.id,
        });
        const template = await transaction.createInitial({
          logicalTemplate,
          version,
        });
        return { outcome: "CREATED", template };
      }

      if (
        templateDefinitionsEqual(current.activeVersion.definition, definition)
      ) {
        return { outcome: "UNCHANGED", template: activeTemplate(current) };
      }

      const version = TemplateVersionEntity.create({
        id: TemplateVersionIdentifier.from(this.ids.next()),
        logicalTemplateId: current.logicalTemplate.id,
        tenantId: current.logicalTemplate.tenantId,
        definition,
      });
      const logicalTemplate = current.logicalTemplate.publish(version.id);
      const template = await transaction.publishNext({
        logicalTemplate,
        version,
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
    ? expectedRevision === current.logicalTemplate.revision
    : expectedRevision === 0;
}

function activeTemplate(current: LockedLogicalTemplate): ActiveTemplate {
  return {
    ...current.logicalTemplate.activeTemplate(),
    fields: current.activeVersion.definition.fields,
  };
}

export const TEMPLATE_PUBLICATION_TRANSACTIONS = Symbol(
  "TEMPLATE_PUBLICATION_TRANSACTIONS",
);
