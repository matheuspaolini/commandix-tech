import { describe, expect, test } from "bun:test";
import {
  ActivationRevisionInvalidError,
  EventIdentityConflictError,
  NotificationProcessingError,
  ProcessContractActivatedEvent,
  type ActivationNotificationRepository,
} from "./process-contract-activated-event";

const EVENT = {
  eventId: "0d087f87-0177-41ce-a705-ffb33d160fb8",
  eventType: "contract.activated",
  schemaVersion: 1,
  tenantId: "a6819601-e52a-4c5c-b875-dae3b7b876d6",
  contractId: "97b729df-5520-4be2-8752-fcb09ba6f312",
  activationRevision: 2,
  occurredAt: "2026-09-10T14:03:22.123Z",
  correlationId: "AE68EDCD-E14F-4E0F-8A56-0C61D91B069E",
} as const;

describe("Process contract activation notification", () => {
  test("logs successful persistence after the repository resolves", async () => {
    const calls: string[] = [];
    const repository: ActivationNotificationRepository = {
      record: async () => {
        calls.push("persisted");
        return "created";
      },
    };
    const useCase = new ProcessContractActivatedEvent(
      repository,
      { now: () => new Date("2026-09-10T15:00:00.000Z") },
      (line) => calls.push(JSON.parse(line).event),
    );

    const result = await useCase.execute(EVENT);

    expect({ result, calls }).toStrictEqual({
      result: "created",
      calls: ["persisted", "notification_processed"],
    });
  });

  test.each([
    ["activation_revision_invalid", new ActivationRevisionInvalidError()],
    ["event_identity_conflict", new EventIdentityConflictError()],
    ["notification_persistence_failed", new Error("database secret")],
  ] as const)(
    "maps failures to %s without leaking details",
    async (reason, failure) => {
      const logs: string[] = [];
      const useCase = new ProcessContractActivatedEvent(
        { record: async () => Promise.reject(failure) },
        undefined,
        (line) => logs.push(line),
      );

      const result = await captureFailure(() => useCase.execute(EVENT));

      expect({ result, log: JSON.parse(logs[0]!) }).toStrictEqual({
        result: new NotificationProcessingError(reason),
        log: {
          event: "notification_processing_failed",
          reason,
          eventId: EVENT.eventId,
          correlationId: EVENT.correlationId,
        },
      });
    },
  );

  test("invalid payload logs only independently valid identifiers", async () => {
    const logs: string[] = [];
    const useCase = new ProcessContractActivatedEvent(
      { record: async () => "created" },
      undefined,
      (line) => logs.push(line),
    );

    await captureFailure(() =>
      useCase.execute({
        eventId: EVENT.eventId,
        correlationId: "secret",
        values: { secret: true },
      }),
    );

    expect(JSON.parse(logs[0]!)).toStrictEqual({
      event: "notification_processing_failed",
      reason: "invalid_event",
      eventId: EVENT.eventId,
    });
  });
});

async function captureFailure(
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  return undefined;
}
