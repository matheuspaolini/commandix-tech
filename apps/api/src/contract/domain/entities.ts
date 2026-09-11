import type { ContractValues } from "./contract-values";
import type { TemplateDefinition } from "./template-definition";

export type ContractStatus = "DRAFT" | "ACTIVE" | "CLOSED";

abstract class Identifier {
  protected constructor(readonly value: string) {
    if (!value) throw new Error("Identifier must not be empty");
  }

  toString(): string {
    return this.value;
  }
}

export class TenantIdentifier extends Identifier {
  static from(value: string): TenantIdentifier {
    return new TenantIdentifier(value);
  }
}

export class ContractIdentifier extends Identifier {
  static from(value: string): ContractIdentifier {
    return new ContractIdentifier(value);
  }
}

export class TemplateVersionIdentifier extends Identifier {
  static from(value: string): TemplateVersionIdentifier {
    return new TemplateVersionIdentifier(value);
  }
}

export class LogicalTemplateIdentifier extends Identifier {
  static from(value: string): LogicalTemplateIdentifier {
    return new LogicalTemplateIdentifier(value);
  }
}

export class HistoryIdentifier extends Identifier {
  static from(value: string): HistoryIdentifier {
    return new HistoryIdentifier(value);
  }
}

export class ActivationOutboxEventIdentifier extends Identifier {
  static from(value: string): ActivationOutboxEventIdentifier {
    return new ActivationOutboxEventIdentifier(value);
  }
}

export class ContractStatusConflict extends Error {}

export class ContractEntity {
  private constructor(
    readonly id: ContractIdentifier,
    readonly tenantId: TenantIdentifier,
    readonly templateVersionId: TemplateVersionIdentifier,
    readonly status: ContractStatus,
    readonly revision: number,
    readonly values: ContractValues,
  ) {}

  static create(input: {
    id: ContractIdentifier;
    tenantId: TenantIdentifier;
    templateVersionId: TemplateVersionIdentifier;
    values: ContractValues;
  }): ContractEntity {
    return new ContractEntity(
      input.id,
      input.tenantId,
      input.templateVersionId,
      "DRAFT",
      1,
      input.values,
    );
  }

  static reconstitute(input: {
    id: ContractIdentifier;
    tenantId: TenantIdentifier;
    templateVersionId: TemplateVersionIdentifier;
    status: ContractStatus;
    revision: number;
    values: ContractValues;
  }): ContractEntity {
    return new ContractEntity(
      input.id,
      input.tenantId,
      input.templateVersionId,
      input.status,
      input.revision,
      input.values,
    );
  }

  transitionTo(target: ContractStatus): ContractEntity {
    if (this.status === "DRAFT" && target === "ACTIVE")
      return new ContractEntity(
        this.id,
        this.tenantId,
        this.templateVersionId,
        "ACTIVE",
        this.revision + 1,
        this.values,
      );
    if (this.status === "ACTIVE" && target === "CLOSED")
      return new ContractEntity(
        this.id,
        this.tenantId,
        this.templateVersionId,
        "CLOSED",
        this.revision + 1,
        this.values,
      );
    throw new ContractStatusConflict();
  }

  withDraftValues(values: ContractValues): ContractEntity {
    if (this.status !== "DRAFT") throw new ContractStatusConflict();
    return new ContractEntity(
      this.id,
      this.tenantId,
      this.templateVersionId,
      this.status,
      this.revision + 1,
      values,
    );
  }

  snapshot(): {
    id: string;
    tenantId: string;
    templateVersionId: string;
    status: ContractStatus;
    revision: number;
    values: ContractValues;
  } {
    return {
      id: this.id.value,
      tenantId: this.tenantId.value,
      templateVersionId: this.templateVersionId.value,
      status: this.status,
      revision: this.revision,
      values: this.values,
    };
  }
}

export class LogicalTemplateEntity {
  private constructor(
    readonly id: LogicalTemplateIdentifier,
    readonly tenantId: TenantIdentifier,
    readonly revision: number,
    readonly activeVersionId: TemplateVersionIdentifier,
  ) {}

  static reconstitute(input: {
    id: LogicalTemplateIdentifier;
    tenantId: TenantIdentifier;
    revision: number;
    activeVersionId: TemplateVersionIdentifier;
  }): LogicalTemplateEntity {
    return new LogicalTemplateEntity(
      input.id,
      input.tenantId,
      input.revision,
      input.activeVersionId,
    );
  }
}

export class TemplateVersionEntity {
  private constructor(
    readonly id: TemplateVersionIdentifier,
    readonly logicalTemplateId: LogicalTemplateIdentifier,
    readonly tenantId: TenantIdentifier,
    readonly definition: TemplateDefinition,
  ) {}

  static reconstitute(input: {
    id: TemplateVersionIdentifier;
    logicalTemplateId: LogicalTemplateIdentifier;
    tenantId: TenantIdentifier;
    definition: TemplateDefinition;
  }): TemplateVersionEntity {
    return new TemplateVersionEntity(
      input.id,
      input.logicalTemplateId,
      input.tenantId,
      input.definition,
    );
  }
}

export class HistoryEntity {
  private constructor(
    readonly id: HistoryIdentifier,
    readonly tenantId: TenantIdentifier,
    readonly contractId: ContractIdentifier,
    readonly revision: number,
  ) {}

  static reconstitute(input: {
    id: HistoryIdentifier;
    tenantId: TenantIdentifier;
    contractId: ContractIdentifier;
    revision: number;
  }): HistoryEntity {
    return new HistoryEntity(
      input.id,
      input.tenantId,
      input.contractId,
      input.revision,
    );
  }
}

export class ActivationOutboxEventEntity {
  private constructor(
    readonly eventId: ActivationOutboxEventIdentifier,
    readonly tenantId: TenantIdentifier,
    readonly contractId: ContractIdentifier,
    readonly activationRevision: number,
  ) {}

  static reconstitute(input: {
    eventId: ActivationOutboxEventIdentifier;
    tenantId: TenantIdentifier;
    contractId: ContractIdentifier;
    activationRevision: number;
  }): ActivationOutboxEventEntity {
    return new ActivationOutboxEventEntity(
      input.eventId,
      input.tenantId,
      input.contractId,
      input.activationRevision,
    );
  }
}
