import { expect, test } from "bun:test";
import type { ContractMutationTransaction } from "@/contract/application/edit-draft-values/contract-mutation";
import {
  ContractLifecycle,
  ContractRevisionConflict,
  ContractStatusConflict,
  TransitionStatus,
} from "@/contract/application/transition-status/transition-status";

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
  const transaction: ContractMutationTransaction = {
    findForUpdate: async () => DRAFT,
    persistActivation: async (input) => {
      persisted = input;
    },
    persistClosure: async () => {},
    persistDraftEdit: async () => {},
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
      targetStatus: "ACTIVE",
      contract: {
        id: "contract-id",
        status: "ACTIVE",
        revision: 2,
        values: { approved: false },
        templateVersion: { id: "template-version-id", fields: [] },
      },
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
  const transaction: ContractMutationTransaction = {
    findForUpdate: async () => ({ ...DRAFT, status: "ACTIVE", revision: 2 }),
    persistActivation: async () => {},
    persistClosure: async () => {},
    persistDraftEdit: async () => {},
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
  const transaction: ContractMutationTransaction = {
    findForUpdate: async () => ({ ...DRAFT, status: "ACTIVE", revision: 2 }),
    persistActivation: async () => {
      persisted = true;
    },
    persistClosure: async () => {
      persisted = true;
    },
    persistDraftEdit: async () => {},
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

test("closes a current Active with one History entry and no Outbox event", async () => {
  let persisted: unknown;
  let generatedIds = 0;
  const transaction: ContractMutationTransaction = {
    findForUpdate: async () => ({ ...DRAFT, status: "ACTIVE", revision: 2 }),
    persistActivation: async () => {},
    persistClosure: async (input) => {
      persisted = input;
    },
    persistDraftEdit: async () => {},
  };
  const useCase = new TransitionStatus(
    { run: (operation) => operation(transaction) },
    { now: () => new Date("2026-09-11T13:00:00.000Z") },
    { next: () => `history-${++generatedIds}` },
  );

  const result = await useCase.execute({
    tenantId: "tenant-id",
    actorId: "actor-id",
    contractId: "contract-id",
    expectedRevision: 2,
    targetStatus: "CLOSED",
    correlationId: "correlation-id",
  });

  expect({ result, persisted, generatedIds }).toStrictEqual({
    result: {
      targetStatus: "CLOSED",
      contract: {
        id: "contract-id",
        status: "CLOSED",
        revision: 3,
        values: { approved: false },
        templateVersion: { id: "template-version-id", fields: [] },
      },
    },
    persisted: {
      contract: {
        id: "contract-id",
        tenantId: "tenant-id",
        status: "CLOSED",
        revision: 3,
      },
      history: {
        id: "history-1",
        tenantId: "tenant-id",
        contractId: "contract-id",
        actorId: "actor-id",
        action: "CLOSED",
        revision: 3,
        occurredAt: new Date("2026-09-11T13:00:00.000Z"),
        before: {
          status: "ACTIVE",
          revision: 2,
          values: { approved: false },
          templateVersionId: "template-version-id",
        },
        after: {
          status: "CLOSED",
          revision: 3,
          values: { approved: false },
          templateVersionId: "template-version-id",
        },
      },
    },
    generatedIds: 1,
  });
});

test("enforces the complete Contract lifecycle matrix", () => {
  const statuses = ["DRAFT", "ACTIVE", "CLOSED"] as const;
  const observed = statuses.flatMap((source) =>
    statuses.map((target) => {
      try {
        return `${source}:${target}:${new ContractLifecycle(source).transitionTo(target)}`;
      } catch (error) {
        return `${source}:${target}:${error instanceof ContractStatusConflict ? "CONFLICT" : "ERROR"}`;
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
