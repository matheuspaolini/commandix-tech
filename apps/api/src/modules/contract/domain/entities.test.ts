import { expect, test } from "bun:test";

import {
  ContractEntity,
  ContractIdentifier,
  ContractStatusConflict,
  ActivationOutboxEventEntity,
  ActivationOutboxEventIdentifier,
  TemplateVersionIdentifier,
  TemplateVersionEntity,
  LogicalTemplateEntity,
  LogicalTemplateIdentifier,
  HistoryEntity,
  HistoryIdentifier,
  TenantIdentifier,
} from "./entities";

test("reconstituted Contract only advances through its lifecycle", () => {
  const contract = ContractEntity.reconstitute({
    id: ContractIdentifier.from("contract-id"),
    tenantId: TenantIdentifier.from("tenant-id"),
    templateVersionId: TemplateVersionIdentifier.from("template-version-id"),
    status: "DRAFT",
    revision: 4,
    values: { approved: false },
  });

  expect({
    activated: contract.transitionTo("ACTIVE").snapshot(),
    invalid: (() => {
      try {
        contract.transitionTo("CLOSED");
        return false;
      } catch (error) {
        return error instanceof ContractStatusConflict;
      }
    })(),
  }).toStrictEqual({
    activated: {
      id: "contract-id",
      tenantId: "tenant-id",
      templateVersionId: "template-version-id",
      status: "ACTIVE",
      revision: 5,
      values: { approved: false },
    },
    invalid: true,
  });
});

test("Contract enforces the complete lifecycle matrix", () => {
  const statuses = ["DRAFT", "ACTIVE", "CLOSED"] as const;
  const observed = statuses.flatMap((status) =>
    statuses.map((target) => {
      const contract = ContractEntity.reconstitute({
        id: ContractIdentifier.from("contract-id"),
        tenantId: TenantIdentifier.from("tenant-id"),
        templateVersionId: TemplateVersionIdentifier.from(
          "template-version-id",
        ),
        status,
        revision: 1,
        values: {},
      });
      try {
        return `${status}:${target}:${contract.transitionTo(target).status}`;
      } catch (error) {
        return `${status}:${target}:${error instanceof ContractStatusConflict ? "CONFLICT" : "ERROR"}`;
      }
    }),
  );

  expect(observed).toStrictEqual([
    "DRAFT:DRAFT:CONFLICT",
    "DRAFT:ACTIVE:ACTIVE",
    "DRAFT:CLOSED:CONFLICT",
    "ACTIVE:DRAFT:CONFLICT",
    "ACTIVE:ACTIVE:CONFLICT",
    "ACTIVE:CLOSED:CLOSED",
    "CLOSED:DRAFT:CONFLICT",
    "CLOSED:ACTIVE:CONFLICT",
    "CLOSED:CLOSED:CONFLICT",
  ]);
});

test("Draft Contract migration replaces its version and values", () => {
  const contract = ContractEntity.reconstitute({
    id: ContractIdentifier.from("contract-id"),
    tenantId: TenantIdentifier.from("tenant-id"),
    templateVersionId: TemplateVersionIdentifier.from("version-id"),
    status: "DRAFT",
    revision: 4,
    values: { title: "Old" },
  });

  expect(
    contract
      .migrateDraft({
        templateVersionId: TemplateVersionIdentifier.from("next-version-id"),
        values: { approved: false },
      })
      .snapshot(),
  ).toStrictEqual({
    id: "contract-id",
    tenantId: "tenant-id",
    templateVersionId: "next-version-id",
    status: "DRAFT",
    revision: 5,
    values: { approved: false },
  });
});

test("creates and advances Contract collaborators with controlled identities", () => {
  const tenantId = TenantIdentifier.from("tenant-id");
  const version = TemplateVersionEntity.create({
    id: TemplateVersionIdentifier.from("version-id"),
    logicalTemplateId: LogicalTemplateIdentifier.from("template-id"),
    tenantId,
    definition: {
      fields: [{ key: "title", label: "Title", type: "text", required: true }],
    },
  });
  const template = LogicalTemplateEntity.create({
    id: version.logicalTemplateId,
    tenantId,
    activeVersionId: version.id,
  });

  expect({
    published: template
      .publish(TemplateVersionIdentifier.from("next-version-id"))
      .activeTemplate(),
    history: HistoryEntity.create({
      id: HistoryIdentifier.from("history-id"),
      tenantId,
      contractId: ContractIdentifier.from("contract-id"),
      revision: 2,
    }).envelope(),
    activation: ActivationOutboxEventEntity.create({
      eventId: ActivationOutboxEventIdentifier.from("event-id"),
      tenantId,
      contractId: ContractIdentifier.from("contract-id"),
      activationRevision: 2,
    }).activation(),
  }).toStrictEqual({
    published: {
      logicalTemplateId: "template-id",
      templateVersionId: "next-version-id",
      revision: 2,
    },
    history: {
      id: "history-id",
      tenantId: "tenant-id",
      contractId: "contract-id",
      revision: 2,
    },
    activation: {
      eventId: "event-id",
      tenantId: "tenant-id",
      contractId: "contract-id",
      activationRevision: 2,
    },
  });
});
