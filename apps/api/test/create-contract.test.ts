import { expect, test } from "bun:test";
import {
  ActiveTemplateRequired,
  CreateContract,
  type ContractCreationTransaction,
} from "../src/contract/create-contract";

const template = {
  id: "template-version",
  definition: {
    fields: [
      {
        key: "approved",
        label: "Approved",
        type: "boolean" as const,
        required: true,
      },
    ],
  },
};

test("creates a revision-one Draft and its first History entry", async () => {
  let inserted: unknown;
  const transaction: ContractCreationTransaction = {
    findActiveTemplateForUpdate: async () => template,
    insertContractAndHistory: async (input) => {
      inserted = input;
    },
  };
  const useCase = new CreateContract(
    { run: (operation) => operation(transaction) },
    { now: () => new Date("2026-09-10T15:00:00.000Z") },
    {
      next: (() => {
        const ids = ["contract-id", "history-id"];
        return () => ids.shift()!;
      })(),
    },
  );

  const result = await useCase.execute({
    tenantId: "tenant-id",
    actorId: "actor-id",
    suppliedValues: { approved: false },
  });

  expect({ result, inserted }).toStrictEqual({
    result: {
      id: "contract-id",
      status: "DRAFT",
      revision: 1,
      templateVersionId: "template-version",
    },
    inserted: {
      contract: {
        id: "contract-id",
        tenantId: "tenant-id",
        status: "DRAFT",
        revision: 1,
        values: { approved: false },
        templateVersionId: "template-version",
        createdAt: new Date("2026-09-10T15:00:00.000Z"),
      },
      history: {
        id: "history-id",
        tenantId: "tenant-id",
        contractId: "contract-id",
        actorId: "actor-id",
        action: "CREATED",
        revision: 1,
        occurredAt: new Date("2026-09-10T15:00:00.000Z"),
        before: null,
        after: {
          status: "DRAFT",
          revision: 1,
          values: { approved: false },
          templateVersionId: "template-version",
        },
      },
    },
  });
});

test("requires an active Template before inserting", async () => {
  let inserted = false;
  const useCase = new CreateContract({
    run: (operation) =>
      operation({
        findActiveTemplateForUpdate: async () => null,
        insertContractAndHistory: async () => {
          inserted = true;
        },
      }),
  });
  let error: unknown;
  try {
    await useCase.execute({
      tenantId: "tenant",
      actorId: "actor",
      suppliedValues: {},
    });
  } catch (caught) {
    error = caught;
  }
  expect({
    required: error instanceof ActiveTemplateRequired,
    inserted,
  }).toStrictEqual({ required: true, inserted: false });
});
