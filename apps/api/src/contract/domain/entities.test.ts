import { expect, test } from "bun:test";

import {
  ContractEntity,
  ContractIdentifier,
  ContractStatusConflict,
  TemplateVersionIdentifier,
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
