import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/platform/database";
import { WorkerRuntimeConfig } from "@/platform/runtime-config";
import { OutboxPublisher } from "@/modules/outbox/presentation/outbox.publisher";
import { PrismaActivationOutboxRepository } from "@/modules/outbox/infrastructure/prisma-activation-outbox.repository";
import {
  ACTIVATION_OUTBOX_REPOSITORY,
  PublishContractActivatedEvent,
  type ActivationOutboxRepository,
  type ContractEventPublisher,
} from "@/modules/outbox/application/publish-contract-activated-event/publish-contract-activated-event";
import { RabbitMqContractEventPublisher } from "@/modules/outbox/infrastructure/rabbitmq-contract-event.publisher";

const CONTRACT_EVENT_PUBLISHER = Symbol("CONTRACT_EVENT_PUBLISHER");

@Module({
  imports: [DatabaseModule],
  providers: [
    PrismaActivationOutboxRepository,
    {
      provide: ACTIVATION_OUTBOX_REPOSITORY,
      useExisting: PrismaActivationOutboxRepository,
    },
    {
      provide: CONTRACT_EVENT_PUBLISHER,
      inject: [WorkerRuntimeConfig],
      useFactory: (config: WorkerRuntimeConfig) => {
        return new RabbitMqContractEventPublisher(
          config.rabbitMqUrl,
          config.outboxPublishConfirmTimeoutMs,
        );
      },
    },
    {
      provide: PublishContractActivatedEvent,
      inject: [ACTIVATION_OUTBOX_REPOSITORY, CONTRACT_EVENT_PUBLISHER],
      useFactory: (
        repository: ActivationOutboxRepository,
        publisher: ContractEventPublisher,
      ) => new PublishContractActivatedEvent(repository, publisher),
    },
    {
      provide: OutboxPublisher,
      inject: [
        ACTIVATION_OUTBOX_REPOSITORY,
        PublishContractActivatedEvent,
        CONTRACT_EVENT_PUBLISHER,
      ],
      useFactory: (
        repository: ActivationOutboxRepository,
        useCase: PublishContractActivatedEvent,
        publisher: ContractEventPublisher,
      ) => new OutboxPublisher(repository, useCase, publisher),
    },
  ],
})
export class OutboxModule {}
