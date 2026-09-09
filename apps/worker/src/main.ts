import "reflect-metadata";
import { Injectable, Module, OnApplicationShutdown } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

@Injectable()
class IdleWorker implements OnApplicationShutdown {
  private readonly keepAlive = setInterval(() => {}, 60_000);

  onApplicationShutdown() {
    clearInterval(this.keepAlive);
    console.log(JSON.stringify({ event: "worker_stopped" }));
  }
}

@Module({ providers: [IdleWorker] })
class WorkerModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: false,
    abortOnError: false,
  });
  app.enableShutdownHooks();
  console.log(JSON.stringify({ event: "worker_started", mode: "idle" }));
}

void main().catch(() => {
  console.error(JSON.stringify({ event: "worker_start_failed" }));
  process.exitCode = 1;
});
