import { expect, test } from "bun:test";
import {
  ContractRevisionConflict,
  ContractStatusConflict,
  TransitionStatus,
  type ContractTransitionTransaction,
} from "../src/contract/transition-status";

const DRAFT = {
  id: "contract-id",
  tenantId: "tenant-id",
  status: "DRAFT" as const,
  revision: 1,
  values: { approved: false },
  templateVersion: {
    id: "template-version-id",
    fields: [],
  },
};

test("activates a current Draft with one History entry and Outbox event", async () => {
  let persisted: unknown;
  const transaction: ContractTransitionTransaction = {
    findForUpdate: async () => DRAFT,
    persistActivation: async (input) => {
      persisted = input;
    },
  };
  const ids = ["history-id", "event-id"];
  const useCase = new TransitionStatus(
    { run: (operation) => operation(transaction) },
    { now: () => new Date("2026-09-10T18:30:00.123Z") },
    { next: () => ids.shift()! },
  );

  const result = await useCase.execute({
    tenantId: "tenant-id",
    actorId: "actor-id",
    contractId: "contract-id",
    expectedRevision: 1,
    targetStatus: "ACTIVE",
    correlationId: "correlation-id",
  });

  expect({ result, persisted }).toStrictEqual({
    result: {
      id: "contract-id",
      status: "ACTIVE",
      revision: 2,
      values: { approved: false },
      templateVersion: { id: "template-version-id", fields: [] },
      eventId: "event-id",
    },
    persisted: {
      contract: {
        id: "contract-id",
        tenantId: "tenant-id",
        status: "ACTIVE",
        revision: 2,
      },
      history: {
        id: "history-id",
        tenantId: "tenant-id",
        contractId: "contract-id",
        actorId: "actor-id",
        action: "ACTIVATED",
        revision: 2,
        occurredAt: new Date("2026-09-10T18:30:00.123Z"),
        before: {
          status: "DRAFT",
          revision: 1,
          values: { approved: false },
          templateVersionId: "template-version-id",
        },
        after: {
          status: "ACTIVE",
          revision: 2,
          values: { approved: false },
          templateVersionId: "template-version-id",
        },
      },
      event: {
        eventId: "event-id",
        eventType: "contract.activated",
        schemaVersion: 1,
        tenantId: "tenant-id",
        contractId: "contract-id",
        activationRevision: 2,
        occurredAt: new Date("2026-09-10T18:30:00.123Z"),
        correlationId: "correlation-id",
        nextAttemptAt: new Date("2026-09-10T18:30:00.123Z"),
      },
    },
  });
});

test("reports a stale revision before an invalid lifecycle", async () => {
  const transaction: ContractTransitionTransaction = {
    findForUpdate: async () => ({ ...DRAFT, status: "ACTIVE", revision: 2 }),
    persistActivation: async () => {},
  };
  const useCase = new TransitionStatus({
    run: (operation) => operation(transaction),
  });

  const error = await useCase
    .execute({
      tenantId: "tenant-id",
      actorId: "actor-id",
      contractId: "contract-id",
      expectedRevision: 1,
      targetStatus: "ACTIVE",
      correlationId: "correlation-id",
    })
    .catch((caught: unknown) => caught);

  expect({
    revisionConflict: error instanceof ContractRevisionConflict,
    statusConflict: error instanceof ContractStatusConflict,
  }).toStrictEqual({ revisionConflict: true, statusConflict: false });
});

test("rejects a current non-Draft lifecycle without persistence", async () => {
  let persisted = false;
  const transaction: ContractTransitionTransaction = {
    findForUpdate: async () => ({ ...DRAFT, status: "ACTIVE", revision: 2 }),
    persistActivation: async () => {
      persisted = true;
    },
  };
  const useCase = new TransitionStatus({
    run: (operation) => operation(transaction),
  });

  const error = await useCase
    .execute({
      tenantId: "tenant-id",
      actorId: "actor-id",
      contractId: "contract-id",
      expectedRevision: 2,
      targetStatus: "ACTIVE",
      correlationId: "correlation-id",
    })
    .catch((caught: unknown) => caught);

  expect({
    statusConflict: error instanceof ContractStatusConflict,
    persisted,
  }).toStrictEqual({ statusConflict: true, persisted: false });
});
