import {
  ContractActivatedEventValidationError,
  isUuid,
  parseContractActivatedEvent,
  type ValidatedContractActivatedEvent,
} from "@commandix/contract-events";
import { NotificationLog } from "@/notification/domain/notification-log";

export type ProcessingOutcome = "created" | "duplicate";
export type FailureReason =
  | "invalid_event"
  | "contract_reference_invalid"
  | "activation_revision_invalid"
  | "event_identity_conflict"
  | "notification_persistence_failed";

export interface ActivationNotificationRepository {
  record(
    event: ValidatedContractActivatedEvent,
    processedAt: Date,
  ): Promise<ProcessingOutcome>;
}

export const ACTIVATION_NOTIFICATION_REPOSITORY = Symbol(
  "ACTIVATION_NOTIFICATION_REPOSITORY",
);
export const NOTIFICATION_CLOCK = Symbol("NOTIFICATION_CLOCK");
export const NOTIFICATION_LOG_WRITER = Symbol("NOTIFICATION_LOG_WRITER");

export type Clock = { now(): Date };
export type LogWriter = (line: string) => void;

export class ContractReferenceInvalidError extends Error {}
export class ActivationRevisionInvalidError extends Error {}
export class EventIdentityConflictError extends Error {}

export class NotificationProcessingError extends Error {
  constructor(readonly reason: FailureReason) {
    super(reason);
  }
}

export class ProcessContractActivatedEvent {
  constructor(
    private readonly repository: ActivationNotificationRepository,
    private readonly clock: Clock = { now: () => new Date() },
    private readonly writeLog: LogWriter = console.log,
  ) {}

  async execute(payload: unknown): Promise<ProcessingOutcome> {
    let event: ValidatedContractActivatedEvent;
    try {
      event = parseContractActivatedEvent(payload);
    } catch (error) {
      if (error instanceof ContractActivatedEventValidationError) {
        this.writeFailure("invalid_event", payload);
        throw new NotificationProcessingError("invalid_event");
      }
      throw error;
    }

    try {
      const notification = NotificationLog.reconstitute({
        event,
        processedAt: this.clock.now(),
      });
      const outcome = await this.repository.record(
        notification.event,
        notification.processedAt,
      );
      this.writeLog(
        JSON.stringify({
          event: "notification_processed",
          outcome,
          eventId: event.eventId,
          correlationId: event.correlationId,
          tenantId: event.tenantId,
          contractId: event.contractId,
        }),
      );
      return outcome;
    } catch (error) {
      const reason = failureReason(error);
      this.writeFailure(reason, payload);
      throw new NotificationProcessingError(reason);
    }
  }

  private writeFailure(reason: FailureReason, payload: unknown): void {
    this.writeLog(
      JSON.stringify({
        event: "notification_processing_failed",
        reason,
        ...safeIdentifiers(payload),
      }),
    );
  }
}

function failureReason(error: unknown): FailureReason {
  if (error instanceof ContractReferenceInvalidError)
    return "contract_reference_invalid";
  if (error instanceof ActivationRevisionInvalidError)
    return "activation_revision_invalid";
  if (error instanceof EventIdentityConflictError)
    return "event_identity_conflict";
  return "notification_persistence_failed";
}

function safeIdentifiers(payload: unknown): {
  eventId?: string;
  correlationId?: string;
} {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    return {};
  const candidate = payload as Record<string, unknown>;
  return {
    ...(isUuid(candidate.eventId) ? { eventId: candidate.eventId } : {}),
    ...(isUuid(candidate.correlationId)
      ? { correlationId: candidate.correlationId }
      : {}),
  };
}
