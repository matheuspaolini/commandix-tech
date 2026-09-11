import type { ContractValues } from "../contract-values";
import type { ContractStatus } from "../read-contract-detail";
import type { TemplateDefinition } from "../template-definition";

export class ContractEntity {
  private constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly templateVersionId: string,
    readonly status: ContractStatus,
    readonly revision: number,
    readonly values: ContractValues,
  ) {}

  static create(input: {
    id: string;
    tenantId: string;
    templateVersionId: string;
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
    id: string;
    tenantId: string;
    templateVersionId: string;
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
}

export class LogicalTemplateEntity {
  private constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly revision: number,
    readonly activeVersionId: string,
  ) {}

  static reconstitute(input: {
    id: string;
    tenantId: string;
    revision: number;
    activeVersionId: string;
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
    readonly id: string,
    readonly logicalTemplateId: string,
    readonly tenantId: string,
    readonly definition: TemplateDefinition,
  ) {}

  static reconstitute(input: {
    id: string;
    logicalTemplateId: string;
    tenantId: string;
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
    readonly id: string,
    readonly tenantId: string,
    readonly contractId: string,
    readonly revision: number,
  ) {}

  static reconstitute(input: {
    id: string;
    tenantId: string;
    contractId: string;
    revision: number;
  }): HistoryEntity {
    return new HistoryEntity(input.id, input.tenantId, input.contractId, input.revision);
  }
}

export class ActivationOutboxEventEntity {
  private constructor(
    readonly eventId: string,
    readonly tenantId: string,
    readonly contractId: string,
    readonly activationRevision: number,
  ) {}

  static reconstitute(input: {
    eventId: string;
    tenantId: string;
    contractId: string;
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
