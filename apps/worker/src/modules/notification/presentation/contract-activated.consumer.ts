import { Controller } from "@nestjs/common";
import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import {
  CONTRACT_ACTIVATED_PATTERN,
  ContractActivatedEventValidationError,
  parseContractActivatedEvent,
} from "@commandix/contract-events";
import {
  NotificationProcessingError,
  ProcessContractActivatedEvent,
} from "@/modules/notification/application/process-contract-activated-event/process-contract-activated-event";
import type { ActivationNotification } from "@/modules/notification/domain/activation-notification";

@Controller()
export class ContractActivatedConsumer {
  constructor(
    private readonly processContractActivatedEvent: ProcessContractActivatedEvent,
  ) {}

  @EventPattern(CONTRACT_ACTIVATED_PATTERN)
  async consume(
    @Payload() payload: unknown,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const message = context.getMessage();
    try {
      await this.processContractActivatedEvent.execute(toNotification(payload));
      channel.ack(message);
    } catch (error) {
      if (error instanceof ContractActivatedEventValidationError) {
        try {
          this.processContractActivatedEvent.invalid(payload);
        } catch (invalid) {
          if (!(invalid instanceof NotificationProcessingError)) throw invalid;
          channel.nack(message, false, false);
          return;
        }
      }
      if (!(error instanceof NotificationProcessingError)) throw error;
      channel.nack(message, false, false);
    }
  }
}

function toNotification(payload: unknown): ActivationNotification {
  const event = parseContractActivatedEvent(payload);
  return { ...event };
}
