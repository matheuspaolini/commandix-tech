import type { ContractActivatedEventV1 } from "@commandix/contract-events";

export type OutboxFailureReason =
  "RETURNED" | "NACKED" | "CONFIRM_TIMEOUT" | "CONNECTION_LOST";

export class ActivationOutboxEvent {
  private constructor(
    readonly event: Omit<ContractActivatedEventV1, "occurredAt"> & {
      occurredAt: Date;
    },
    readonly attemptCount: number,
  ) {}

  static reconstitute(input: {
    event: Omit<ContractActivatedEventV1, "occurredAt"> & {
      occurredAt: Date;
    };
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
