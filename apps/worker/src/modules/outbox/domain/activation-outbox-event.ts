export type OutboxFailureReason =
  "RETURNED" | "NACKED" | "CONFIRM_TIMEOUT" | "CONNECTION_LOST";

export type ActivationOutboxEventData = {
  eventId: string;
  eventType: "contract.activated";
  schemaVersion: 1;
  tenantId: string;
  contractId: string;
  activationRevision: number;
  occurredAt: Date;
  correlationId: string;
};

export class ActivationOutboxEvent {
  private constructor(
    readonly event: ActivationOutboxEventData,
    readonly attemptCount: number,
  ) {}

  static reconstitute(input: {
    event: ActivationOutboxEventData;
    attemptCount: number;
  }): ActivationOutboxEvent {
    return new ActivationOutboxEvent(input.event, input.attemptCount);
  }

  nextAttempt(attemptedAt: Date): {
    attemptCount: number;
    attemptedAt: Date;
    nextAttemptAt: Date;
  } {
    const attemptCount = this.attemptCount + 1;
    return {
      attemptCount,
      attemptedAt,
      nextAttemptAt: new Date(
        attemptedAt.valueOf() + retryDelayMs(attemptCount),
      ),
    };
  }
}

export function retryDelayMs(attemptCount: number): number {
  return [250, 500, 1_000, 2_000][attemptCount - 1] ?? 5_000;
}
