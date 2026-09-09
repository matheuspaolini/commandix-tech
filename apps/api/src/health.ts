import { Controller, Get, Injectable, Res } from "@nestjs/common";
import { connect } from "amqplib";
import { Client } from "pg";
import type { Response } from "express";

const DEADLINE_MS = 2000;

async function bounded(
  check: (signal: AbortSignal) => Promise<void>,
): Promise<"up" | "down"> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout;
  const timeout = new Promise<"down">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("down");
    }, DEADLINE_MS);
  });
  try {
    return await Promise.race([
      check(controller.signal).then(
        () => "up" as const,
        () => "down" as const,
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer!);
    controller.abort();
  }
}

@Injectable()
export class HealthService {
  async check() {
    const [database, broker] = await Promise.all([
      bounded(async (signal) => {
        const client = new Client({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 1000,
          query_timeout: 1000,
        });
        client.on("error", () => {});
        const close = () => {
          void client.end().catch(() => {});
        };
        signal.addEventListener("abort", close, { once: true });
        try {
          await client.connect();
          await client.query("SELECT 1");
        } finally {
          close();
          signal.removeEventListener("abort", close);
        }
      }),
      bounded(async (signal) => {
        if (!process.env.RABBITMQ_URL)
          throw new Error("Missing broker configuration");
        // amqplib forwards these options to net.connect; abort also bounds handshake/close.
        const connection = await connect(process.env.RABBITMQ_URL, {
          timeout: 1000,
          signal,
        });
        connection.on("error", () => {});
        await connection.close();
      }),
    ]);
    return {
      status: database === "up" && broker === "up" ? "ok" : "unavailable",
      dependencies: { database, broker },
    };
  }
}

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("health")
  async get(@Res({ passthrough: true }) response: Response) {
    const health = await this.health.check();
    response.status(health.status === "ok" ? 200 : 503);
    return health;
  }
}
