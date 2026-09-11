import {
  ActivationOutboxEvent,
  retryDelayMs,
  type ActivationOutboxEventData,
  type OutboxFailureReason,
} from "@/modules/outbox/domain/activation-outbox-event";

export type OutboxEvent = ActivationOutboxEventData & { attemptCount: number };

export type AttemptReservation = {
  attemptCount: number;
  attemptedAt: Date;
  nextAttemptAt: Date;
};

export interface ActivationOutboxRepository {
  findDue(now: Date, limit: number): Promise<OutboxEvent[]>;
  reserveAttempt(eventId: string, attempt: AttemptReservation): Promise<void>;
  recordFailure(eventId: string, reason: OutboxFailureReason): Promise<void>;
  markPublished(eventId: string, publishedAt: Date): Promise<void>;
}

export const ACTIVATION_OUTBOX_REPOSITORY = Symbol(
  "ACTIVATION_OUTBOX_REPOSITORY",
);

export interface ContractEventPublisher {
  publish(event: OutboxEvent): Promise<DeliveryResult>;
}

export type DeliveryResult =
  { outcome: "published" } | { outcome: "failed"; reason: OutboxFailureReason };

export interface PublisherClock {
  now(): Date;
}

export type PublicationResult = {
  event: OutboxEvent;
  outcome: "published" | "failed" | "unexpected_failure";
};
export class PublishContractActivatedEvent {
  constructor(
    private readonly outbox: ActivationOutboxRepository,
    private readonly publisher: ContractEventPublisher,
    private readonly clock: PublisherClock,
    private readonly afterConfirmation: () => Promise<void> = async () => {},
  ) {}

  async execute(input: { limit: number }): Promise<PublicationResult[]> {
    const events = await this.outbox.findDue(this.clock.now(), input.limit);
    const results: PublicationResult[] = [];
    for (const event of events) {
      try {
        results.push({ event, outcome: await this.publish(event) });
      } catch {
        results.push({ event, outcome: "unexpected_failure" });
      }
    }
    return results;
  }

  private async publish(
    event: OutboxEvent,
  ): Promise<PublicationResult["outcome"]> {
    const attemptedAt = this.clock.now();
    const attempt = ActivationOutboxEvent.reconstitute({
      event,
      attemptCount: event.attemptCount,
    }).nextAttempt(attemptedAt);
    await this.outbox.reserveAttempt(event.eventId, attempt);

    const delivery = await this.publisher.publish(event);
    if (delivery.outcome === "failed") {
      await this.outbox.recordFailure(event.eventId, delivery.reason);
      return "failed";
    }
    await this.afterConfirmation();
    await this.outbox.markPublished(event.eventId, attemptedAt);
    return "published";
  }
}

export { retryDelayMs } from "@/modules/outbox/domain/activation-outbox-event";
