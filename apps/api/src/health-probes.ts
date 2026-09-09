import { Injectable } from "@nestjs/common";
import { connect } from "amqplib";
import { Client } from "pg";

import { RuntimeConfig } from "./runtime-config";

const CONNECTION_TIMEOUT_MS = 1_000;
const QUERY_TIMEOUT_MS = 1_000;
const HEALTH_CHECK_DEADLINE_MS = 2_000;
const HEALTH_QUERY = "SELECT 1";

export type DependencyStatus = "up" | "down";

export interface DependencyHealthProbe {
  check(signal: AbortSignal): Promise<void>;
}

export const DATABASE_HEALTH_PROBE = Symbol("DATABASE_HEALTH_PROBE");
export const BROKER_HEALTH_PROBE = Symbol("BROKER_HEALTH_PROBE");

@Injectable()
export class PostgreSqlHealthProbe implements DependencyHealthProbe {
  constructor(private readonly config: RuntimeConfig) {}

  async check(signal: AbortSignal): Promise<void> {
    const client = new Client({
      connectionString: this.config.databaseUrl,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      query_timeout: QUERY_TIMEOUT_MS,
    });
    const closeClient = createIdempotentClientCloser(client);
    const closeOnAbort = () => {
      void closeClient().catch(ignoreConnectionError);
    };

    client.on("error", ignoreConnectionError);
    signal.addEventListener("abort", closeOnAbort, { once: true });

    try {
      await client.connect();
      await client.query(HEALTH_QUERY);
    } finally {
      signal.removeEventListener("abort", closeOnAbort);
      await closeClient();
    }
  }
}

@Injectable()
export class RabbitMqHealthProbe implements DependencyHealthProbe {
  constructor(private readonly config: RuntimeConfig) {}

  async check(signal: AbortSignal): Promise<void> {
    const connection = await connect(this.config.rabbitMqUrl, {
      timeout: CONNECTION_TIMEOUT_MS,
      signal,
    });

    connection.on("error", ignoreConnectionError);

    try {
      // Establishing the connection is the health assertion.
    } finally {
      await connection.close();
    }
  }
}

@Injectable()
export class HealthProbeRunner {
  async run(
    probe: DependencyHealthProbe,
    deadlineMs = HEALTH_CHECK_DEADLINE_MS,
  ): Promise<DependencyStatus> {
    const controller = new AbortController();
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<DependencyStatus>((resolve) => {
      deadlineTimer = setTimeout(() => resolve("down"), deadlineMs);
    });
    const probeResult = probe.check(controller.signal).then(
      () => "up" as const,
      () => "down" as const,
    );

    try {
      return await Promise.race([probeResult, deadline]);
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      controller.abort();
    }
  }
}

function createIdempotentClientCloser(client: Client): () => Promise<void> {
  let closing: Promise<void> | undefined;

  return () => {
    closing ??= client.end();
    return closing;
  };
}

function ignoreConnectionError(): void {}
