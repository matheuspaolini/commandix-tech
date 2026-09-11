import { Injectable } from "@nestjs/common";
import { DatabaseService } from "@/platform/database";
import type { OutboxFailureReason } from "@/modules/outbox/domain/activation-outbox-event";
import type {
  ActivationOutboxRepository,
  AttemptReservation,
  OutboxEvent,
} from "@/modules/outbox/application/publish-contract-activated-event/publish-contract-activated-event";

@Injectable()
export class PrismaActivationOutboxRepository implements ActivationOutboxRepository {
  constructor(private readonly database: DatabaseService) {}

  findDue(now: Date, limit: number): Promise<OutboxEvent[]> {
    return this.database.client.contractActivationOutbox.findMany({
      where: { publishedAt: null, nextAttemptAt: { lte: now } },
      orderBy: [{ occurredAt: "asc" }, { eventId: "asc" }],
      take: limit,
      select: {
        eventId: true,
        eventType: true,
        schemaVersion: true,
        tenantId: true,
        contractId: true,
        activationRevision: true,
        occurredAt: true,
        correlationId: true,
        attemptCount: true,
      },
    }) as Promise<OutboxEvent[]>;
  }

  async reserveAttempt(
    eventId: string,
    attempt: AttemptReservation,
  ): Promise<void> {
    await this.database.client.contractActivationOutbox.update({
      where: { eventId },
      data: {
        attemptCount: attempt.attemptCount,
        lastAttemptAt: attempt.attemptedAt,
        nextAttemptAt: attempt.nextAttemptAt,
      },
    });
  }

  async recordFailure(
    eventId: string,
    reason: OutboxFailureReason,
  ): Promise<void> {
    await this.database.client.contractActivationOutbox.update({
      where: { eventId },
      data: { failureReason: reason },
    });
  }

  async markPublished(eventId: string, publishedAt: Date): Promise<void> {
    await this.database.client.contractActivationOutbox.update({
      where: { eventId },
      data: { publishedAt, failureReason: null },
    });
  }
}
