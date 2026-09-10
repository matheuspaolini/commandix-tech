import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { type MicroserviceOptions, Transport } from "@nestjs/microservices";
import { CONTRACT_ACTIVATED_QUEUE } from "./notification/contract-activated-event";
import { RabbitMqTopology } from "./notification/rabbitmq-topology";
import { workerRuntimeConfigFromEnvironment } from "./runtime-config";
import { WorkerModule } from "./worker.module";

async function main(): Promise<void> {
  const config = workerRuntimeConfigFromEnvironment();
  await new RabbitMqTopology(config.rabbitMqUrl).declare();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    WorkerModule,
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

void main().catch(() => {
  console.error(JSON.stringify({ event: "worker_start_failed" }));
  process.exitCode = 1;
});
