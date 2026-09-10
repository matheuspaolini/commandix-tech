export class WorkerRuntimeConfig {
  private constructor(
    readonly databaseUrl: string,
    readonly rabbitMqUrl: string,
    readonly outboxPublishConfirmTimeoutMs: number,
  ) {}

  static fromEnvironment(environment: {
    DATABASE_URL?: string;
    RABBITMQ_URL?: string;
    OUTBOX_PUBLISH_CONFIRM_TIMEOUT_MS?: string;
  }): WorkerRuntimeConfig {
    return new WorkerRuntimeConfig(
      requiredValue(environment.DATABASE_URL, "DATABASE_URL"),
      requiredValue(environment.RABBITMQ_URL, "RABBITMQ_URL"),
      boundedInteger(environment.OUTBOX_PUBLISH_CONFIRM_TIMEOUT_MS ?? "5000"),
    );
  }
}

export function workerRuntimeConfigFromEnvironment(): WorkerRuntimeConfig {
  return WorkerRuntimeConfig.fromEnvironment({
    DATABASE_URL: Bun.env.DATABASE_URL,
    RABBITMQ_URL: Bun.env.RABBITMQ_URL,
    OUTBOX_PUBLISH_CONFIRM_TIMEOUT_MS:
      Bun.env.OUTBOX_PUBLISH_CONFIRM_TIMEOUT_MS,
  });
}

function boundedInteger(value: string): number {
  if (!/^\d+$/.test(value))
    throw new Error(
      "Invalid runtime configuration: OUTBOX_PUBLISH_CONFIRM_TIMEOUT_MS",
    );
  const parsed = Number(value);
  if (parsed < 100 || parsed > 60_000)
    throw new Error(
      "Invalid runtime configuration: OUTBOX_PUBLISH_CONFIRM_TIMEOUT_MS",
    );
  return parsed;
}

function requiredValue(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing runtime configuration: ${name}`);
  return value;
}
