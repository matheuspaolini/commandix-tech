import { expect, test } from "bun:test";
import type {
  DraftEditTransaction,
  LockedDraftContract,
} from "@/contract/application/edit-draft-values/draft-edit-transaction";
import {
  EditDraftValues,
  ContractRevisionConflict,
  ContractStatusConflict,
} from "@/contract/application/edit-draft-values/edit-draft-values";

const DRAFT = {
  id: "contract-id",
  tenantId: "tenant-id",
  status: "DRAFT" as const,
  revision: 1,
  values: { title: "Agreement", amount: 100 },
  templateVersion: {
    id: "template-version-id",
    fields: [
      { key: "title", label: "Title", type: "text" as const, required: true },
      {
        key: "amount",
        label: "Amount",
        type: "number" as const,
        required: false,
        default: 100,
      },
    ],
  },
};

function transactionFor(
  contract: LockedDraftContract = DRAFT,
): DraftEditTransaction & { persisted?: unknown } {
  const transaction: DraftEditTransaction & { persisted?: unknown } = {
    findForUpdate: async () => contract,
    persistDraftEdit: async (input) => {
      transaction.persisted = input;
    },
  };
  return transaction;
}

test("edits a current Draft with one accurate History entry", async () => {
  const transaction = transactionFor();
  const useCase = new EditDraftValues(
    { run: (operation) => operation(transaction) },
    { now: () => new Date("2026-09-11T15:00:00.000Z") },
    { next: () => "history-id" },
  );

  const result = await useCase.execute({
    tenantId: "tenant-id",
    actorId: "actor-id",
    contractId: "contract-id",
    expectedRevision: 1,
    suppliedValues: { title: "Renewed" },
    clearedKeys: ["amount"],
  });

  expect({ result, persisted: transaction.persisted }).toStrictEqual({
    result: {
      id: "contract-id",
      status: "DRAFT",
      revision: 2,
      values: { title: "Renewed" },
      templateVersion: DRAFT.templateVersion,
    },
    persisted: {
      contract: {
        id: "contract-id",
        tenantId: "tenant-id",
        revision: 2,
        values: { title: "Renewed" },
      },
      history: {
        id: "history-id",
        tenantId: "tenant-id",
        contractId: "contract-id",
        actorId: "actor-id",
        action: "EDITED",
        revision: 2,
        occurredAt: new Date("2026-09-11T15:00:00.000Z"),
        before: {
          status: "DRAFT",
          revision: 1,
          values: { title: "Agreement", amount: 100 },
          templateVersionId: "template-version-id",
        },
        after: {
          status: "DRAFT",
          revision: 2,
          values: { title: "Renewed" },
          templateVersionId: "template-version-id",
        },
      },
    },
  });
});

test("returns a canonical no-op without persistence or generated audit data", async () => {
  const transaction = transactionFor();
  let generated = false;
  const useCase = new EditDraftValues(
    { run: (operation) => operation(transaction) },
    {
      now: () => {
        throw new Error("clock should not run");
      },
    },
    {
      next: () => {
        generated = true;
        return "unused";
      },
    },
  );

  const result = await useCase.execute({
    tenantId: "tenant-id",
    actorId: "actor-id",
    contractId: "contract-id",
    expectedRevision: 1,
    suppliedValues: { amount: 100, title: "Agreement" },
    clearedKeys: [],
  });

  expect({ result, persisted: transaction.persisted, generated }).toStrictEqual(
    {
      result: {
        id: "contract-id",
        status: "DRAFT",
        revision: 1,
        values: { title: "Agreement", amount: 100 },
        templateVersion: DRAFT.templateVersion,
      },
      persisted: undefined,
      generated: false,
    },
  );
});

test("checks revision and Draft eligibility before resolving values", async () => {
  const active = { ...DRAFT, status: "ACTIVE" as const, revision: 2 };
  const stale = new EditDraftValues({
    run: (operation) => operation(transactionFor(active)),
  });
  const current = new EditDraftValues({
    run: (operation) => operation(transactionFor(active)),
  });

  const staleError = await stale
    .execute({
      tenantId: "tenant-id",
      actorId: "actor-id",
      contractId: "contract-id",
      expectedRevision: 1,
      suppliedValues: null,
      clearedKeys: [],
    })
    .catch((error: unknown) => error);
  const statusError = await current
    .execute({
      tenantId: "tenant-id",
      actorId: "actor-id",
      contractId: "contract-id",
      expectedRevision: 2,
      suppliedValues: null,
      clearedKeys: [],
    })
    .catch((error: unknown) => error);

  expect({
    stale: staleError instanceof ContractRevisionConflict,
    status: statusError instanceof ContractStatusConflict,
  }).toStrictEqual({ stale: true, status: true });
});
