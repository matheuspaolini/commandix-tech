import { describe, expect, test } from "bun:test";
import type { Response } from "express";

import { HealthController, HealthService } from "../src/health";
import {
  type DependencyHealthProbe,
  HealthProbeRunner,
} from "../src/health-probes";

class PassingHealthProbe implements DependencyHealthProbe {
  async check(): Promise<void> {}
}

class FailingHealthProbe implements DependencyHealthProbe {
  async check(): Promise<void> {
    throw new Error("unavailable");
  }
}

class DeferredHealthProbe implements DependencyHealthProbe {
  started = false;
  private complete: (() => void) | undefined;

  check(): Promise<void> {
    this.started = true;

    return new Promise((resolve) => {
      this.complete = resolve;
    });
  }

  resolve(): void {
    this.complete?.();
  }
}

class RecordingResponse {
  statusCode: number | undefined;

  status(statusCode: number): this {
    this.statusCode = statusCode;
    return this;
  }
}

function createHealthService(
  database: DependencyHealthProbe,
  broker: DependencyHealthProbe,
): HealthService {
  return new HealthService(new HealthProbeRunner(), database, broker);
}

async function controllerResult(
  database: DependencyHealthProbe,
  broker: DependencyHealthProbe,
) {
  const response = new RecordingResponse();
  const controller = new HealthController(
    createHealthService(database, broker),
  );
  const report = await controller.get(response as unknown as Response);

  return { statusCode: response.statusCode, report };
}

describe("HealthProbeRunner", () => {
  test("reports a completed probe as up", async () => {
    const status = await new HealthProbeRunner().run(new PassingHealthProbe());

    expect(status).toBe("up");
  });

  test("reports a failed probe as down", async () => {
    const status = await new HealthProbeRunner().run(new FailingHealthProbe());

    expect(status).toBe("down");
  });

  test("reports a probe exceeding its deadline as down", async () => {
    const status = await new HealthProbeRunner().run(
      new DeferredHealthProbe(),
      1,
    );

    expect(status).toBe("down");
  });
});

describe("HealthService", () => {
  test("reports both available dependencies", async () => {
    const report = await createHealthService(
      new PassingHealthProbe(),
      new PassingHealthProbe(),
    ).check();

    expect(report).toStrictEqual({
      status: "ok",
      dependencies: { database: "up", broker: "up" },
    });
  });

  test("reports an unavailable database", async () => {
    const report = await createHealthService(
      new FailingHealthProbe(),
      new PassingHealthProbe(),
    ).check();

    expect(report).toStrictEqual({
      status: "unavailable",
      dependencies: { database: "down", broker: "up" },
    });
  });

  test("reports an unavailable broker", async () => {
    const report = await createHealthService(
      new PassingHealthProbe(),
      new FailingHealthProbe(),
    ).check();

    expect(report).toStrictEqual({
      status: "unavailable",
      dependencies: { database: "up", broker: "down" },
    });
  });

  test("reports both unavailable dependencies", async () => {
    const report = await createHealthService(
      new FailingHealthProbe(),
      new FailingHealthProbe(),
    ).check();

    expect(report).toStrictEqual({
      status: "unavailable",
      dependencies: { database: "down", broker: "down" },
    });
  });

  test("starts both dependency probes concurrently", async () => {
    const database = new DeferredHealthProbe();
    const broker = new DeferredHealthProbe();
    const checking = createHealthService(database, broker).check();

    await Promise.resolve();
    database.resolve();
    broker.resolve();
    await checking;

    expect([database.started, broker.started]).toStrictEqual([true, true]);
  });
});

describe("HealthController", () => {
  test("maps an available report to HTTP 200", async () => {
    const result = await controllerResult(
      new PassingHealthProbe(),
      new PassingHealthProbe(),
    );

    expect(result).toMatchObject({ statusCode: 200 });
  });

  test("maps an unavailable report to HTTP 503", async () => {
    const result = await controllerResult(
      new FailingHealthProbe(),
      new PassingHealthProbe(),
    );

    expect(result).toMatchObject({ statusCode: 503 });
  });
});
