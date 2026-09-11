import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { type MicroserviceOptions, Transport } from "@nestjs/microservices";
import { CONTRACT_ACTIVATED_QUEUE } from "./notification/contract-activated-event";
import { RabbitMqTopology } from "./notification/rabbitmq-topology";
import { workerRuntimeConfigFromEnvironment } from "./runtime-config";
import { createWorkerModule } from "./worker.module";

async function main(): Promise<void> {
  const config = workerRuntimeConfigFromEnvironment();
  await declareTopology(new RabbitMqTopology(config.rabbitMqUrl));
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    createWorkerModule(config),
    {
      logger: false,
      abortOnError: false,
      transport: Transport.RMQ,
      options: {
        urls: [config.rabbitMqUrl],
        queue: CONTRACT_ACTIVATED_QUEUE,
        noAck: false,
        noAssert: true,
        prefetchCount: 10,
      },
    },
  );
  app.enableShutdownHooks();
  await app.listen();
  console.log(JSON.stringify({ event: "worker_started", mode: "consumer" }));
}

async function declareTopology(topology: RabbitMqTopology): Promise<void> {
  let attempt = 0;
  for (;;) {
    try {
      await topology.declare();
      return;
    } catch {
      const delay = [250, 500, 1_000, 2_000][attempt++] ?? 5_000;
      console.error(
        JSON.stringify({
          event: "worker_broker_startup_retry",
          delayMs: delay,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

void main().catch(() => {
  console.error(JSON.stringify({ event: "worker_start_failed" }));
  process.exitCode = 1;
});
