import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  Body,
  Controller,
  Get,
  type INestApplication,
  Module,
  Post,
} from "@nestjs/common";
import { IsString } from "class-validator";
import request from "supertest";

import { AppModule, createApp } from "@/bootstrap/app";
import { HealthController, HealthService } from "@/platform/health";

Bun.env.JWT_SECRET ??= "local_development_jwt_secret_with_32_chars";
Bun.env.AUTH_ALLOWED_ORIGINS ??= "http://localhost:8080";
Bun.env.AUTH_COOKIE_SECURE ??= "false";

const ACCEPTED_CORRELATION_ID = "ae68edcd-e14f-4e0f-8a56-0c61d91b069e";
const UPPERCASE_CORRELATION_ID = "AE68EDCD-E14F-4E0F-8A56-0C61D91B069E";
const PRIVATE_VALUES = /secret-password|snapshot-private-value|stack/;
const MALFORMED_PRIVATE_VALUES = /secret-password|stack/;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const invalidProbeBodies = [
  ["unknown properties", { name: "valid", extra: true }],
  ["implicit scalar conversion", { name: 123 }],
  ["missing required properties", {}],
] as const;

class ProbeDto {
  @IsString()
  name!: string;
}

@Controller("test-only")
class ProbeController {
  @Post()
  validate(@Body() body: ProbeDto) {
    return body;
  }

  @Get("unexpected")
  unexpected() {
    throw new Error("secret-password snapshot-private-value");
  }
}

const HEALTHY_REPORT = {
  status: "ok",
  dependencies: { database: "up", broker: "up" },
} as const;

@Module({
  controllers: [ProbeController, HealthController],
  providers: [
    {
      provide: HealthService,
      useValue: { check: async () => HEALTHY_REPORT },
    },
  ],
})
class TestModule {}

const logs: string[] = [];
let app: INestApplication;

function get(path: string) {
  return request(app.getHttpServer()).get(path);
}

function post(path: string) {
  return request(app.getHttpServer()).post(path);
}

function recordLog(line: string): void {
  logs.push(line);
}

function parseLog(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

function captureNewLogs(startIndex: number): string[] {
  return logs.slice(startIndex);
}

function lastCapturedLog(capturedLogs: string[]): Record<string, unknown> {
  const line = capturedLogs.at(-1);
  if (!line) throw new Error("Expected the request to produce an HTTP log");

  return parseLog(line);
}

async function createHealthScenario() {
  const response = await get("/health");

  return {
    status: response.status,
    body: response.body,
    correlationId: response.headers["x-correlation-id"] ?? "",
  };
}

async function createValidationErrorScenario() {
  const logStart = logs.length;
  const response = await post("/test-only")
    .set("x-correlation-id", ACCEPTED_CORRELATION_ID)
    .send({
      name: { password: "secret-password" },
      snapshot: "snapshot-private-value",
    });
  const capturedLogs = captureNewLogs(logStart);

  return {
    status: response.status,
    body: response.body,
    responseCorrelationId: response.headers["x-correlation-id"],
    log: lastCapturedLog(capturedLogs),
    serializedOutput: JSON.stringify(response.body) + capturedLogs.join("\n"),
  };
}

async function createUnexpectedErrorScenario() {
  const logStart = logs.length;
  const response = await get("/test-only/unexpected?token=secret-password")
    .set("authorization", "Bearer secret-password")
    .set("cookie", "refresh=secret-password");
  const capturedLogs = captureNewLogs(logStart);

  return {
    status: response.status,
    body: response.body,
    responseCorrelationId: response.headers["x-correlation-id"],
    log: lastCapturedLog(capturedLogs),
    serializedOutput: JSON.stringify(response.body) + capturedLogs.join("\n"),
  };
}

async function createAcceptedCorrelationScenario() {
  const logStart = logs.length;
  const response = await get("/health").set(
    "x-correlation-id",
    UPPERCASE_CORRELATION_ID,
  );
  const capturedLogs = captureNewLogs(logStart);

  return {
    status: response.status,
    responseCorrelationId: response.headers["x-correlation-id"],
    log: lastCapturedLog(capturedLogs),
  };
}

async function createRejectedCorrelationScenario() {
  const logStart = logs.length;
  const response = await get(
    "/secret-password?value=snapshot-private-value",
  ).set("x-correlation-id", "secret-password");
  const capturedLogs = captureNewLogs(logStart);

  return {
    status: response.status,
    bodyCorrelationId: response.body.correlationId,
    responseCorrelationId: response.headers["x-correlation-id"] ?? "",
    log: lastCapturedLog(capturedLogs),
    serializedLogs: capturedLogs.join("\n"),
  };
}

async function createMalformedJsonScenario() {
  const logStart = logs.length;
  const response = await post("/test-only")
    .set("Content-Type", "application/json")
    .send('{"secret-password":');
  const capturedLogs = captureNewLogs(logStart);

  return {
    status: response.status,
    body: response.body,
    bodyCorrelationId: response.body.correlationId,
    responseCorrelationId: response.headers["x-correlation-id"],
    log: lastCapturedLog(capturedLogs),
    serializedOutput: JSON.stringify(response.body) + capturedLogs.join("\n"),
  };
}

async function probeProductionOnlyRoutes() {
  const production = await createApp({
    rootModule: AppModule,
    writeLog: () => {},
  });

  try {
    await production.init();
    const postResponse = await request(production.getHttpServer())
      .post("/test-only")
      .send({ name: "valid" });
    const getResponse = await request(production.getHttpServer()).get(
      "/test-only/unexpected",
    );

    return [postResponse.status, getResponse.status];
  } finally {
    await production.close();
  }
}

type HealthScenario = Awaited<ReturnType<typeof createHealthScenario>>;
type ValidationErrorScenario = Awaited<
  ReturnType<typeof createValidationErrorScenario>
>;
type UnexpectedErrorScenario = Awaited<
  ReturnType<typeof createUnexpectedErrorScenario>
>;
type AcceptedCorrelationScenario = Awaited<
  ReturnType<typeof createAcceptedCorrelationScenario>
>;
type RejectedCorrelationScenario = Awaited<
  ReturnType<typeof createRejectedCorrelationScenario>
>;
type MalformedJsonScenario = Awaited<
  ReturnType<typeof createMalformedJsonScenario>
>;

beforeAll(async () => {
  app = await createApp({
    rootModule: TestModule,
    writeLog: recordLog,
  });
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

describe("health", () => {
  let scenario: HealthScenario;

  beforeAll(async () => {
    scenario = await createHealthScenario();
  });

  test("returns HTTP 200", () => {
    expect(scenario.status).toBe(200);
  });

  test("reports healthy dependencies", () => {
    expect(scenario.body).toStrictEqual({
      status: "ok",
      dependencies: { database: "up", broker: "up" },
    });
  });

  test("generates a correlation UUID", () => {
    expect(scenario.correlationId).toMatch(UUID_V4);
  });
});

describe("sanitized validation errors", () => {
  let scenario: ValidationErrorScenario;

  beforeAll(async () => {
    scenario = await createValidationErrorScenario();
  });

  test("returns HTTP 400", () => {
    expect(scenario.status).toBe(400);
  });

  test("returns a sanitized correlated body", () => {
    expect(scenario.body).toStrictEqual({
      statusCode: 400,
      error: "Bad Request",
      correlationId: ACCEPTED_CORRELATION_ID,
    });
  });

  test("returns the accepted correlation ID header", () => {
    expect(scenario.responseCorrelationId).toBe(ACCEPTED_CORRELATION_ID);
  });

  test("records the correlation ID and status", () => {
    expect(scenario.log).toMatchObject({
      correlationId: ACCEPTED_CORRELATION_ID,
      statusCode: 400,
    });
  });

  test("does not expose private values", () => {
    expect(scenario.serializedOutput).not.toMatch(PRIVATE_VALUES);
  });
});

describe("unexpected errors", () => {
  let scenario: UnexpectedErrorScenario;

  beforeAll(async () => {
    scenario = await createUnexpectedErrorScenario();
  });

  test("returns HTTP 500", () => {
    expect(scenario.status).toBe(500);
  });

  test("returns a sanitized correlated body", () => {
    expect(scenario.body).toStrictEqual({
      statusCode: 500,
      error: "Internal Server Error",
      correlationId: scenario.responseCorrelationId,
    });
  });

  test("records the response correlation ID", () => {
    expect(scenario.log.correlationId).toBe(scenario.body.correlationId);
  });

  test("records HTTP 500", () => {
    expect(scenario.log.statusCode).toBe(500);
  });

  test("does not expose private values", () => {
    expect(scenario.serializedOutput).not.toMatch(PRIVATE_VALUES);
  });
});

describe("accepted correlation IDs", () => {
  let scenario: AcceptedCorrelationScenario;

  beforeAll(async () => {
    scenario = await createAcceptedCorrelationScenario();
  });

  test("returns HTTP 200", () => {
    expect(scenario.status).toBe(200);
  });

  test("preserves the accepted response header", () => {
    expect(scenario.responseCorrelationId).toBe(UPPERCASE_CORRELATION_ID);
  });

  test("propagates the ID into the request log", () => {
    expect(scenario.log.correlationId).toBe(UPPERCASE_CORRELATION_ID);
  });

  test("records the matched route", () => {
    expect(scenario.log).toMatchObject({
      event: "http_request",
      route: "/health",
    });
  });
});

describe("rejected correlation IDs and unmatched routes", () => {
  let scenario: RejectedCorrelationScenario;

  beforeAll(async () => {
    scenario = await createRejectedCorrelationScenario();
  });

  test("returns HTTP 404", () => {
    expect(scenario.status).toBe(404);
  });

  test("generates a replacement correlation ID", () => {
    expect(scenario.responseCorrelationId).toMatch(UUID_V4);
  });

  test("uses the replacement ID in the response body", () => {
    expect(scenario.bodyCorrelationId).toBe(scenario.responseCorrelationId);
  });

  test("records the route as unmatched", () => {
    expect(scenario.log.route).toBe("unmatched");
  });

  test("does not log private URL or header values", () => {
    expect(scenario.serializedLogs).not.toMatch(
      /secret-password|snapshot-private-value/,
    );
  });
});

describe("DTO validation", () => {
  for (const [validationCase, body] of invalidProbeBodies) {
    test(`rejects ${validationCase}`, async () => {
      const response = await post("/test-only").send(body);
      expect(response.status).toBe(400);
    });
  }

  test("accepts a valid DTO", async () => {
    const response = await post("/test-only").send({ name: "valid" });

    expect({ status: response.status, body: response.body }).toStrictEqual({
      status: 201,
      body: { name: "valid" },
    });
  });
});

describe("malformed JSON", () => {
  let scenario: MalformedJsonScenario;

  beforeAll(async () => {
    scenario = await createMalformedJsonScenario();
  });

  test("returns HTTP 400", () => {
    expect(scenario.status).toBe(400);
  });

  test("uses the response correlation ID in the body", () => {
    expect(scenario.bodyCorrelationId).toBe(scenario.responseCorrelationId);
  });

  test("uses the body correlation ID in the request log", () => {
    expect(scenario.log.correlationId).toBe(scenario.bodyCorrelationId);
  });

  test("does not expose private values", () => {
    expect(scenario.serializedOutput).not.toMatch(MALFORMED_PRIVATE_VALUES);
  });
});

test("production does not expose test-only routes", async () => {
  const statuses = await probeProductionOnlyRoutes();
  expect(statuses).toStrictEqual([404, 404]);
});
