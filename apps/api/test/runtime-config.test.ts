import { describe, expect, test } from "bun:test";

import { RuntimeConfig, type RuntimeEnvironment } from "../src/runtime-config";

const SECRET = "local_development_jwt_secret_with_32_chars";
const VALID_ENVIRONMENT = {
  DATABASE_URL: "postgresql://database.example/commandix",
  RABBITMQ_URL: "amqp://broker.example",
  JWT_SECRET: SECRET,
} satisfies RuntimeEnvironment;

const invalidConfigurationCases = [
  [
    "a missing database URL",
    { DATABASE_URL: undefined },
    "Missing runtime configuration: DATABASE_URL",
  ],
  [
    "a missing RabbitMQ URL",
    { RABBITMQ_URL: undefined },
    "Missing runtime configuration: RABBITMQ_URL",
  ],
  [
    "a missing JWT secret",
    { JWT_SECRET: undefined },
    "Missing runtime configuration: JWT_SECRET",
  ],
  [
    "a short JWT secret",
    { JWT_SECRET: "too-short" },
    "JWT_SECRET must contain at least 32 characters",
  ],
] satisfies ReadonlyArray<
  readonly [string, Partial<RuntimeEnvironment>, string]
>;

function runtimeConfig(
  overrides: Partial<RuntimeEnvironment> = {},
): RuntimeConfig {
  return RuntimeConfig.fromEnvironment({
    ...VALID_ENVIRONMENT,
    ...overrides,
  });
}

function capturedError(overrides: Partial<RuntimeEnvironment>): Error {
  try {
    runtimeConfig(overrides);
  } catch (error) {
    if (error instanceof Error) return error;
  }

  throw new Error("Expected runtime configuration to be rejected");
}

describe("RuntimeConfig", () => {
  test("creates a typed configuration from a valid environment", () => {
    const config = runtimeConfig();

    expect({
      databaseUrl: config.databaseUrl,
      rabbitMqUrl: config.rabbitMqUrl,
      jwtSecret: config.jwtSecret,
    }).toStrictEqual({
      databaseUrl: VALID_ENVIRONMENT.DATABASE_URL,
      rabbitMqUrl: VALID_ENVIRONMENT.RABBITMQ_URL,
      jwtSecret: VALID_ENVIRONMENT.JWT_SECRET,
    });
  });

  for (const [scenario, overrides, message] of invalidConfigurationCases) {
    test(`rejects ${scenario}`, () => {
      expect(() => runtimeConfig(overrides)).toThrow(message);
    });
  }

  test("does not include configuration values in errors", () => {
    const privateValue = "private-short-secret";
    const error = capturedError({ JWT_SECRET: privateValue });

    expect(error.message).not.toContain(privateValue);
  });
});
