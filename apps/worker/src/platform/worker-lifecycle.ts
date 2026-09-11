import { Injectable, OnApplicationShutdown } from "@nestjs/common";

@Injectable()
export class WorkerLifecycle implements OnApplicationShutdown {
  onApplicationShutdown(): void {
    console.log(JSON.stringify({ event: "worker_stopped" }));
  }
}
