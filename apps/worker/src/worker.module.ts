import { Module } from "@nestjs/common";
import { NotificationModule } from "./notification/notification.module";
import { WorkerLifecycle } from "./worker-lifecycle";
import { OutboxModule } from "./outbox/outbox.module";

@Module({
  imports: [NotificationModule, OutboxModule],
  providers: [WorkerLifecycle],
})
export class WorkerModule {}
