import { DynamicModule, Global, Module } from "@nestjs/common";

const MINIMUM_JWT_SECRET_LENGTH = 32;

export type RuntimeEnvironment = {
  DATABASE_URL?: string;
  RABBITMQ_URL?: string;
  JWT_SECRET?: string;
  AUTH_ALLOWED_ORIGINS?: string;
  AUTH_COOKIE_SECURE?: string;
};

export class RuntimeConfig {
  private constructor(
    readonly databaseUrl: string,
    readonly rabbitMqUrl: string,
    readonly jwtSecret: string,
    readonly allowedBrowserOrigins: ReadonlySet<string>,
    readonly secureRefreshCookie: boolean,
  ) {}

  static fromEnvironment(environment: RuntimeEnvironment): RuntimeConfig {
    const databaseUrl = requiredValue(environment.DATABASE_URL, "DATABASE_URL");
    const rabbitMqUrl = requiredValue(environment.RABBITMQ_URL, "RABBITMQ_URL");
    const jwtSecret = requiredSecret(environment.JWT_SECRET);
    const allowedBrowserOrigins = parseAllowedOrigins(
      requiredValue(environment.AUTH_ALLOWED_ORIGINS, "AUTH_ALLOWED_ORIGINS"),
    );
    const secureRefreshCookie = parseBoolean(
      requiredValue(environment.AUTH_COOKIE_SECURE, "AUTH_COOKIE_SECURE"),
      "AUTH_COOKIE_SECURE",
    );

    return new RuntimeConfig(
      databaseUrl,
      rabbitMqUrl,
      jwtSecret,
      allowedBrowserOrigins,
      secureRefreshCookie,
    );
  }
}

export function runtimeConfigFromEnvironment(): RuntimeConfig {
  return RuntimeConfig.fromEnvironment({
    DATABASE_URL: Bun.env.DATABASE_URL,
    RABBITMQ_URL: Bun.env.RABBITMQ_URL,
    JWT_SECRET: Bun.env.JWT_SECRET,
    AUTH_ALLOWED_ORIGINS: Bun.env.AUTH_ALLOWED_ORIGINS,
    AUTH_COOKIE_SECURE: Bun.env.AUTH_COOKIE_SECURE,
  });
}

function parseBoolean(value: string, variableName: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${variableName} must be true or false`);
}

function parseAllowedOrigins(value: string): ReadonlySet<string> {
  const origins = value.split(",").map(parseOrigin);
  const uniqueOrigins = new Set(origins);

  if (uniqueOrigins.size !== origins.length) {
    throw new Error("AUTH_ALLOWED_ORIGINS must not contain duplicates");
  }

  return uniqueOrigins;
}

function parseOrigin(value: string): string {
  if (value !== value.trim() || !value) {
    throw new Error("AUTH_ALLOWED_ORIGINS contains an invalid origin");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("AUTH_ALLOWED_ORIGINS contains an invalid origin");
  }

  const hasInvalidParts =
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    Boolean(url.username || url.password) ||
    url.pathname !== "/" ||
    Boolean(url.search || url.hash) ||
    url.hostname.includes("*") ||
    url.origin !== value;

  if (hasInvalidParts) {
    throw new Error("AUTH_ALLOWED_ORIGINS contains an invalid origin");
  }

  return url.origin;
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
  exports: [RuntimeConfig],
})
export class RuntimeConfigModule {
  static register(config: RuntimeConfig): DynamicModule {
    return {
      module: RuntimeConfigModule,
      providers: [{ provide: RuntimeConfig, useValue: config }],
      exports: [RuntimeConfig],
    };
  }
}
