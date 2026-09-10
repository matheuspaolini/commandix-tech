export class WorkerRuntimeConfig {
  private constructor(
    readonly databaseUrl: string,
    readonly rabbitMqUrl: string,
  ) {}

  static fromEnvironment(environment: {
    DATABASE_URL?: string;
    RABBITMQ_URL?: string;
  }): WorkerRuntimeConfig {
    return new WorkerRuntimeConfig(
      requiredValue(environment.DATABASE_URL, "DATABASE_URL"),
      requiredValue(environment.RABBITMQ_URL, "RABBITMQ_URL"),
    );
  }
}

export function workerRuntimeConfigFromEnvironment(): WorkerRuntimeConfig {
  return WorkerRuntimeConfig.fromEnvironment({
    DATABASE_URL: Bun.env.DATABASE_URL,
    RABBITMQ_URL: Bun.env.RABBITMQ_URL,
  });
}

function requiredValue(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing runtime configuration: ${name}`);
  return value;
}
