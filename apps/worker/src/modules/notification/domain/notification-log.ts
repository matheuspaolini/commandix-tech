import type { ActivationNotification } from "./activation-notification";

/** Persisted evidence of one activation delivery, keyed by its stable event ID. */
export class NotificationLog {
  private constructor(
    readonly event: ActivationNotification,
    readonly processedAt: Date,
  ) {}

  static reconstitute(input: {
    event: ActivationNotification;
    processedAt: Date;
  }): NotificationLog {
    return new NotificationLog(input.event, input.processedAt);
  }
}
