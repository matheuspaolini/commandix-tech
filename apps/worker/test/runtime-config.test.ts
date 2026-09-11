import { expect, test } from "bun:test";
import { WorkerRuntimeConfig } from "@/platform/runtime-config";

const ENVIRONMENT = {
  DATABASE_URL: "postgresql://database",
  RABBITMQ_URL: "amqp://broker",
};

test("defaults the Outbox confirmation deadline to five seconds", () => {
  const config = WorkerRuntimeConfig.fromEnvironment(ENVIRONMENT);

  expect(config.outboxPublishConfirmTimeoutMs).toBe(5_000);
});

test("accepts only bounded integer Outbox confirmation deadlines", () => {
  const values = ["99", "100", "60000", "60001", "1.5", "secret"];
  const accepted = values.map((value) => {
    try {
      return WorkerRuntimeConfig.fromEnvironment({
        ...ENVIRONMENT,
        OUTBOX_PUBLISH_CONFIRM_TIMEOUT_MS: value,
      }).outboxPublishConfirmTimeoutMs;
    } catch (error) {
      return error instanceof Error ? error.message : "unknown";
    }
  });

  expect(accepted).toStrictEqual([
    "Invalid runtime configuration: OUTBOX_PUBLISH_CONFIRM_TIMEOUT_MS",
    100,
    60_000,
    "Invalid runtime configuration: OUTBOX_PUBLISH_CONFIRM_TIMEOUT_MS",
    "Invalid runtime configuration: OUTBOX_PUBLISH_CONFIRM_TIMEOUT_MS",
    "Invalid runtime configuration: OUTBOX_PUBLISH_CONFIRM_TIMEOUT_MS",
  ]);
});
