import type { ContractActivatedEventV1 } from "@commandix/contract-events";
import type { OutboxFailureReason } from "@commandix/database";

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
  reserveAttempt(eventId: string, attempt: AttemptReservation): Promise<void>;
  recordFailure(eventId: string, reason: OutboxFailureReason): Promise<void>;
  markPublished(eventId: string, publishedAt: Date): Promise<void>;
}

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
    const attemptCount = event.attemptCount + 1;
    await this.outbox.reserveAttempt(event.eventId, {
      attemptCount,
      attemptedAt,
      nextAttemptAt: new Date(
        attemptedAt.valueOf() + retryDelayMs(attemptCount),
      ),
    });

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

export function retryDelayMs(attemptCount: number): number {
  return [250, 500, 1_000, 2_000][attemptCount - 1] ?? 5_000;
}

function publicationFailureReason(
  error: unknown,
): OutboxFailureReason | undefined {
  if (!(error instanceof Error)) return undefined;
  return FAILURE_REASONS.has(error.message as OutboxFailureReason)
    ? (error.message as OutboxFailureReason)
    : undefined;
}
