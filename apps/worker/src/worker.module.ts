import { DynamicModule, Global, Module } from "@nestjs/common";
import { NotificationModule } from "./notification/notification.module";
import { WorkerLifecycle } from "./worker-lifecycle";
import { OutboxModule } from "./outbox/outbox.module";
import { WorkerRuntimeConfig } from "./runtime-config";

export function createWorkerModule(config: WorkerRuntimeConfig): DynamicModule {
  @Global()
  @Module({
    providers: [{ provide: WorkerRuntimeConfig, useValue: config }],
    exports: [WorkerRuntimeConfig],
  })
  class WorkerRuntimeConfigModule {}

  @Module({
    imports: [NotificationModule, OutboxModule],
    providers: [WorkerLifecycle],
  })
  class WorkerModule {}

  return { module: WorkerModule, imports: [WorkerRuntimeConfigModule] };
}
