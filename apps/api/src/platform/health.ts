import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Injectable,
  Res,
} from "@nestjs/common";
import type { Response } from "express";

import {
  type DependencyStatus,
  type DependencyHealthProbe,
  BROKER_HEALTH_PROBE,
  DATABASE_HEALTH_PROBE,
  HealthProbeRunner,
} from "./health-probes";

export type HealthReport = {
  status: "ok" | "unavailable";
  dependencies: {
    database: DependencyStatus;
    broker: DependencyStatus;
  };
};

@Injectable()
export class HealthService {
  constructor(
    private readonly runner: HealthProbeRunner,
    @Inject(DATABASE_HEALTH_PROBE)
    private readonly database: DependencyHealthProbe,
    @Inject(BROKER_HEALTH_PROBE)
    private readonly broker: DependencyHealthProbe,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, broker] = await Promise.all([
      this.runner.run(this.database),
      this.runner.run(this.broker),
    ]);

    return createHealthReport(database, broker);
  }
}

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("health")
  async get(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthReport> {
    const report = await this.health.check();

    response.status(statusFor(report));
    return report;
  }
}

function createHealthReport(
  database: DependencyStatus,
  broker: DependencyStatus,
): HealthReport {
  const allDependenciesAreUp = database === "up" && broker === "up";

  return {
    status: allDependenciesAreUp ? "ok" : "unavailable",
    dependencies: { database, broker },
  };
}

function statusFor(report: HealthReport): HttpStatus {
  return report.status === "ok"
    ? HttpStatus.OK
    : HttpStatus.SERVICE_UNAVAILABLE;
}
