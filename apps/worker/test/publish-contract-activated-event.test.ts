import { expect, test } from "bun:test";
import {
  PublishContractActivatedEvent,
  retryDelayMs,
  type ActivationOutboxRepository,
  type ContractEventPublisher,
  type OutboxEvent,
} from "../src/outbox/publish-contract-activated-event";

const EVENT: OutboxEvent = {
  eventId: "0d087f87-0177-41ce-a705-ffb33d160fb8",
  eventType: "contract.activated",
  schemaVersion: 1,
  tenantId: "a6819601-e52a-4c5c-b875-dae3b7b876d6",
  contractId: "97b729df-5520-4be2-8752-fcb09ba6f312",
  activationRevision: 2,
  occurredAt: new Date("2026-09-10T18:30:00.123Z"),
  correlationId: "ae68edcd-e14f-4e0f-8a56-0c61d91b069e",
  attemptCount: 0,
};

test("reserves, confirms, and marks an Outbox event published", async () => {
  const calls: unknown[] = [];
  const repository: ActivationOutboxRepository = {
    reserveAttempt: async (eventId, attempt) => {
      calls.push({ eventId, attempt });
    },
    recordFailure: async () => {},
    markPublished: async (eventId, publishedAt) => {
      calls.push({ eventId, publishedAt });
    },
  };
  const publisher: ContractEventPublisher = {
    publish: async (event) => {
      calls.push({ published: event });
    },
    close: async () => {},
  };
  const useCase = new PublishContractActivatedEvent(repository, publisher, {
    now: () => new Date("2026-09-10T18:31:00.000Z"),
  });

  await useCase.execute(EVENT);

  expect(calls).toStrictEqual([
    {
      eventId: EVENT.eventId,
      attempt: {
        attemptCount: 1,
        attemptedAt: new Date("2026-09-10T18:31:00.000Z"),
        nextAttemptAt: new Date("2026-09-10T18:31:00.250Z"),
      },
    },
    { published: EVENT },
    {
      eventId: EVENT.eventId,
      publishedAt: new Date("2026-09-10T18:31:00.000Z"),
    },
  ]);
});

test("records a safe failure and leaves publication pending", async () => {
  const failures: unknown[] = [];
  const repository: ActivationOutboxRepository = {
    reserveAttempt: async () => {},
    recordFailure: async (eventId, reason) => {
      failures.push({ eventId, reason });
    },
    markPublished: async () => {
      throw new Error("must not mark");
    },
  };
  const publisher: ContractEventPublisher = {
    publish: async () => {
      throw new Error("RETURNED");
    },
    close: async () => {},
  };
  const useCase = new PublishContractActivatedEvent(repository, publisher);

  const result = await useCase.execute(EVENT);

  expect({ result, failures }).toStrictEqual({
    result: "failed",
    failures: [{ eventId: EVENT.eventId, reason: "RETURNED" }],
  });
});

test("keeps a confirmed event retryable when marking is interrupted", async () => {
  let marked = false;
  const repository: ActivationOutboxRepository = {
    reserveAttempt: async () => {},
    recordFailure: async () => {},
    markPublished: async () => {
      marked = true;
    },
  };
  const publisher: ContractEventPublisher = {
    publish: async () => {},
    close: async () => {},
  };
  const useCase = new PublishContractActivatedEvent(
    repository,
    publisher,
    { now: () => new Date("2026-09-10T18:31:00.000Z") },
    async () => {
      throw new Error("simulated_post_confirmation_failure");
    },
  );

  const error = await useCase.execute(EVENT).catch((caught: unknown) => caught);

  expect({
    marked,
    message: error instanceof Error ? error.message : undefined,
  }).toStrictEqual({
    marked: false,
    message: "simulated_post_confirmation_failure",
  });
});

test("uses finite exponential delays with a five-second cap", () => {
  expect([1, 2, 3, 4, 5, 20].map(retryDelayMs)).toStrictEqual([
    250, 500, 1_000, 2_000, 5_000, 5_000,
  ]);
});
