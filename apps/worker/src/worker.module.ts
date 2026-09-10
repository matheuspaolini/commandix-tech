import { Module } from "@nestjs/common";
import { NotificationModule } from "./notification/notification.module";
import { WorkerLifecycle } from "./worker-lifecycle";

@Module({ imports: [NotificationModule], providers: [WorkerLifecycle] })
export class WorkerModule {}
