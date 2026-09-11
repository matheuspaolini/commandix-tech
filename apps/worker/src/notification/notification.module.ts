import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database";
import { ContractActivatedConsumer } from "@/notification/presentation/contract-activated.consumer";
import { PrismaActivationNotificationRepository } from "@/notification/infrastructure/prisma-activation-notification.repository";
import {
  ACTIVATION_NOTIFICATION_REPOSITORY,
  NOTIFICATION_CLOCK,
  NOTIFICATION_LOG_WRITER,
  ProcessContractActivatedEvent,
  type ActivationNotificationRepository,
  type Clock,
  type LogWriter,
} from "@/notification/application/process-contract-activated-event/process-contract-activated-event";

@Module({
  imports: [DatabaseModule],
  controllers: [ContractActivatedConsumer],
  providers: [
    PrismaActivationNotificationRepository,
    {
      provide: ACTIVATION_NOTIFICATION_REPOSITORY,
      useExisting: PrismaActivationNotificationRepository,
    },
    { provide: NOTIFICATION_CLOCK, useValue: { now: () => new Date() } },
    { provide: NOTIFICATION_LOG_WRITER, useValue: console.log },
    {
      provide: ProcessContractActivatedEvent,
      inject: [
        ACTIVATION_NOTIFICATION_REPOSITORY,
        NOTIFICATION_CLOCK,
        NOTIFICATION_LOG_WRITER,
      ],
      useFactory: (
        repository: ActivationNotificationRepository,
        clock: Clock,
        writeLog: LogWriter,
      ) => new ProcessContractActivatedEvent(repository, clock, writeLog),
    },
  ],
})
export class NotificationModule {}
