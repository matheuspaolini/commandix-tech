import { expect, test } from "bun:test";
import {
  ContractHistoryIntegrityError,
  ReadContractHistory,
} from "@/modules/contract/application/read-contract-history/read-contract-history";
import type { TemplateDefinition } from "@/modules/contract/domain/template-definition";

const VERSION_ID = "ed174ad1-3d85-49d1-84ed-9a6d14d4cc69";
const snapshot = {
  status: "DRAFT",
  revision: 1,
  values: { title: "Agreement" },
  templateVersionId: VERSION_ID,
};
const definition = {
  fields: [{ key: "title", label: "Title", type: "text", required: true }],
} satisfies TemplateDefinition;

test("resolves creation History using its saved Template version", async () => {
  const reader = new ReadContractHistory({
    findByTenantAndContract: async () => ({
      contract: { id: "contract-id", status: "DRAFT", revision: 1 },
      entries: [
        {
          id: "history-id",
          action: "CREATED",
          revision: 1,
          occurredAt: new Date("2026-09-11T12:30:00.000Z"),
          actor: { id: "actor-id", email: "admin@acme.test" },
          beforeSnapshot: null,
          afterSnapshot: snapshot,
        },
      ],
      templateVersions: [{ id: VERSION_ID, definition }],
    }),
  });

  expect(
    await reader.execute({ tenantId: "tenant-id", contractId: "contract-id" }),
  ).toEqual({
    contract: { id: "contract-id", status: "DRAFT", revision: 1 },
    entries: [
      {
        id: "history-id",
        action: "CREATED",
        revision: 1,
        occurredAt: "2026-09-11T12:30:00.000Z",
        actor: { id: "actor-id", email: "admin@acme.test" },
        before: null,
        after: {
          status: "DRAFT",
          revision: 1,
          values: { title: "Agreement" },
          templateVersion: { id: VERSION_ID, fields: definition.fields },
        },
      },
    ],
  });
});

test("rejects History whose snapshot Template version is missing", async () => {
  const reader = new ReadContractHistory({
    findByTenantAndContract: async () => ({
      contract: { id: "contract-id", status: "DRAFT", revision: 1 },
      entries: [
        {
          id: "history-id",
          action: "CREATED",
          revision: 1,
          occurredAt: new Date(),
          actor: { id: "actor-id", email: "admin@acme.test" },
          beforeSnapshot: null,
          afterSnapshot: snapshot,
        },
      ],
      templateVersions: [],
    }),
  });

  expect(
    reader.execute({ tenantId: "tenant-id", contractId: "contract-id" }),
  ).rejects.toBeInstanceOf(ContractHistoryIntegrityError);
});
