import type { ValidatedContractActivatedEvent } from "@commandix/contract-events";

/** Persisted evidence of one activation delivery, keyed by its stable event ID. */
export class NotificationLog {
  private constructor(
    readonly event: ValidatedContractActivatedEvent,
    readonly processedAt: Date,
  ) {}

  static reconstitute(input: {
    event: ValidatedContractActivatedEvent;
    processedAt: Date;
  }): NotificationLog {
    return new NotificationLog(input.event, input.processedAt);
  }
}
