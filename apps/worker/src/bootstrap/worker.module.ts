import { DynamicModule, Global, Module } from "@nestjs/common";
import { NotificationModule } from "@/modules/notification/notification.module";
import { WorkerLifecycle } from "@/platform/worker-lifecycle";
import { OutboxModule } from "@/modules/outbox/outbox.module";
import { WorkerRuntimeConfig } from "@/platform/runtime-config";

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
