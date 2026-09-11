import { Controller } from "@nestjs/common";
import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import { CONTRACT_ACTIVATED_PATTERN } from "@commandix/contract-events";
import {
  NotificationProcessingError,
  ProcessContractActivatedEvent,
} from "@/notification/application/process-contract-activated-event/process-contract-activated-event";

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
      await this.processContractActivatedEvent.execute(payload);
      channel.ack(message);
    } catch (error) {
      if (!(error instanceof NotificationProcessingError)) throw error;
      channel.nack(message, false, false);
    }
  }
}
