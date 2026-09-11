import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database";
import { WorkerRuntimeConfig } from "../runtime-config";
import { OutboxPublisher } from "./outbox.publisher";
import { PrismaActivationOutboxRepository } from "./prisma-activation-outbox.repository";
import {
  PublishContractActivatedEvent,
  type ContractEventPublisher,
} from "./publish-contract-activated-event";
import { RabbitMqContractEventPublisher } from "./rabbitmq-contract-event.publisher";

const CONTRACT_EVENT_PUBLISHER = Symbol("CONTRACT_EVENT_PUBLISHER");

@Module({
  imports: [DatabaseModule],
  providers: [
    PrismaActivationOutboxRepository,
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
      inject: [PrismaActivationOutboxRepository, CONTRACT_EVENT_PUBLISHER],
      useFactory: (
        repository: PrismaActivationOutboxRepository,
        publisher: ContractEventPublisher,
      ) => new PublishContractActivatedEvent(repository, publisher),
    },
    {
      provide: OutboxPublisher,
      inject: [
        PrismaActivationOutboxRepository,
        PublishContractActivatedEvent,
        CONTRACT_EVENT_PUBLISHER,
      ],
      useFactory: (
        repository: PrismaActivationOutboxRepository,
        useCase: PublishContractActivatedEvent,
        publisher: ContractEventPublisher,
      ) => new OutboxPublisher(repository, useCase, publisher),
    },
  ],
})
export class OutboxModule {}
