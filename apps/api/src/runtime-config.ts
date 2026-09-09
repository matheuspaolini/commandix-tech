import { Global, Module } from "@nestjs/common";

const MINIMUM_JWT_SECRET_LENGTH = 32;

export type RuntimeEnvironment = {
  DATABASE_URL?: string;
  RABBITMQ_URL?: string;
  JWT_SECRET?: string;
};

export class RuntimeConfig {
  private constructor(
    readonly databaseUrl: string,
    readonly rabbitMqUrl: string,
    readonly jwtSecret: string,
  ) {}

  static fromEnvironment(environment: RuntimeEnvironment): RuntimeConfig {
    const databaseUrl = requiredValue(environment.DATABASE_URL, "DATABASE_URL");
    const rabbitMqUrl = requiredValue(environment.RABBITMQ_URL, "RABBITMQ_URL");
    const jwtSecret = requiredSecret(environment.JWT_SECRET);

    return new RuntimeConfig(databaseUrl, rabbitMqUrl, jwtSecret);
  }
}

export function runtimeConfigFromEnvironment(): RuntimeConfig {
  return RuntimeConfig.fromEnvironment({
    DATABASE_URL: Bun.env.DATABASE_URL,
    RABBITMQ_URL: Bun.env.RABBITMQ_URL,
    JWT_SECRET: Bun.env.JWT_SECRET,
  });
}

export function jwtSecretFromEnvironment(): string {
  return requiredSecret(Bun.env.JWT_SECRET);
}

function requiredValue(
  value: string | undefined,
  variableName: string,
): string {
  if (!value) {
    throw new Error(`Missing runtime configuration: ${variableName}`);
  }

  return value;
}

function requiredSecret(value: string | undefined): string {
  const secret = requiredValue(value, "JWT_SECRET");

  if (secret.length < MINIMUM_JWT_SECRET_LENGTH) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }

  return secret;
}

@Global()
@Module({
  providers: [
    {
      provide: RuntimeConfig,
      useFactory: runtimeConfigFromEnvironment,
    },
  ],
  exports: [RuntimeConfig],
})
export class RuntimeConfigModule {}
