import type { ContractActivatedEventV1 } from "@commandix/contract-events";
import {
  ActivationOutboxEvent,
  retryDelayMs,
  type OutboxFailureReason,
} from "@/outbox/domain/activation-outbox-event";

export type OutboxEvent = Omit<ContractActivatedEventV1, "occurredAt"> & {
  occurredAt: Date;
  attemptCount: number;
};

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
  publish(event: OutboxEvent): Promise<void>;
  close(): Promise<void>;
}

export interface PublisherClock {
  now(): Date;
}

export type PublicationResult = "published" | "failed";

const SYSTEM_CLOCK: PublisherClock = { now: () => new Date() };
const FAILURE_REASONS = new Set<OutboxFailureReason>([
  "RETURNED",
  "NACKED",
  "CONFIRM_TIMEOUT",
  "CONNECTION_LOST",
]);

export class PublishContractActivatedEvent {
  constructor(
    private readonly outbox: ActivationOutboxRepository,
    private readonly publisher: ContractEventPublisher,
    private readonly clock: PublisherClock = SYSTEM_CLOCK,
    private readonly afterConfirmation: () => Promise<void> = async () => {},
  ) {}

  async execute(event: OutboxEvent): Promise<PublicationResult> {
    const attemptedAt = this.clock.now();
    const attempt = ActivationOutboxEvent.reconstitute({
      event,
      attemptCount: event.attemptCount,
    }).nextAttempt(attemptedAt);
    await this.outbox.reserveAttempt(event.eventId, attempt);

    try {
      await this.publisher.publish(event);
      await this.afterConfirmation();
      await this.outbox.markPublished(event.eventId, attemptedAt);
      return "published";
    } catch (error) {
      const reason = publicationFailureReason(error);
      if (!reason) throw error;
      await this.outbox.recordFailure(event.eventId, reason);
      return "failed";
    }
  }
}

export { retryDelayMs } from "@/outbox/domain/activation-outbox-event";

function publicationFailureReason(
  error: unknown,
): OutboxFailureReason | undefined {
  if (!(error instanceof Error)) return undefined;
  return FAILURE_REASONS.has(error.message as OutboxFailureReason)
    ? (error.message as OutboxFailureReason)
    : undefined;
}
