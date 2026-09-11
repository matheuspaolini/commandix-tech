import { Prisma } from "@commandix/database";
import { Injectable } from "@nestjs/common";
import { DatabaseService } from "@/platform/database";
import {
  ActivationRevisionInvalidError,
  ContractReferenceInvalidError,
  EventIdentityConflictError,
  type ActivationNotificationRepository,
  type ProcessingOutcome,
} from "@/modules/notification/application/process-contract-activated-event/process-contract-activated-event";
import type { ActivationNotification } from "@/modules/notification/domain/activation-notification";

@Injectable()
export class PrismaActivationNotificationRepository implements ActivationNotificationRepository {
  constructor(private readonly database: DatabaseService) {}

  async record(
    event: ActivationNotification,
    processedAt: Date,
  ): Promise<ProcessingOutcome> {
    try {
      await this.database.client.$transaction(async (transaction) => {
        const contract = await transaction.contract.findUnique({
          where: {
            id_tenantId: { id: event.contractId, tenantId: event.tenantId },
          },
          select: { revision: true },
        });
        if (!contract) throw new ContractReferenceInvalidError();
        if (contract.revision < event.activationRevision)
          throw new ActivationRevisionInvalidError();

        await transaction.notificationLog.create({
          data: { ...event, processedAt },
        });
      });
      return "created";
    } catch (error) {
      if (!isUniqueEventIdConflict(error)) throw error;
      return this.resolveDuplicate(event);
    }
  }

  private async resolveDuplicate(
    event: ActivationNotification,
  ): Promise<ProcessingOutcome> {
    const existing = await this.database.client.notificationLog.findUnique({
      where: { eventId: event.eventId },
    });
    if (!existing || !sameEvent(existing, event))
      throw new EventIdentityConflictError();
    return "duplicate";
  }
}

function isUniqueEventIdConflict(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function sameEvent(
  stored: {
    eventId: string;
    eventType: string;
    schemaVersion: number;
    tenantId: string;
    contractId: string;
    activationRevision: number;
    occurredAt: Date;
    correlationId: string;
  },
  incoming: ActivationNotification,
): boolean {
  return (
    stored.eventId.toLowerCase() === incoming.eventId.toLowerCase() &&
    stored.eventType === incoming.eventType &&
    stored.schemaVersion === incoming.schemaVersion &&
    stored.tenantId.toLowerCase() === incoming.tenantId.toLowerCase() &&
    stored.contractId.toLowerCase() === incoming.contractId.toLowerCase() &&
    stored.activationRevision === incoming.activationRevision &&
    stored.occurredAt.getTime() === incoming.occurredAt.getTime() &&
    stored.correlationId.toLowerCase() === incoming.correlationId.toLowerCase()
  );
}
