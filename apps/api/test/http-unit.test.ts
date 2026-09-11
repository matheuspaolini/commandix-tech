import { describe, expect, test } from "bun:test";
import type { NextFunction, Request, Response } from "express";

import { HttpRequestLogger, RequestContext } from "@/platform/http";

const ACCEPTED_CORRELATION_ID = "AE68EDCD-E14F-4E0F-8A56-0C61D91B069E";
const GENERATED_CORRELATION_ID = "ae68edcd-e14f-4e0f-8a56-0c61d91b069e";

const rejectedCorrelationIdCases = [
  ["a missing ID", undefined],
  ["a malformed ID", "not-a-uuid"],
  ["a non-string ID", [ACCEPTED_CORRELATION_ID]],
] as const;

class RecordingResponse {
  readonly headers = new Map<string, string>();
  statusCode = 200;
  private finishListener: (() => void) | undefined;

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  once(event: string, listener: () => void): void {
    if (event === "finish") this.finishListener = listener;
  }

  finish(): void {
    this.finishListener?.();
  }
}

type RequestScenarioOptions = {
  correlationId?: string | readonly string[];
  route?: string;
  url?: string;
};

function createRequestScenario(options: RequestScenarioOptions = {}) {
  const logs: string[] = [];
  const context = new RequestContext();
  const response = new RecordingResponse();
  const times = [100.2, 105.8];
  const request = {
    headers: { "x-correlation-id": options.correlationId },
    method: "GET",
    route: options.route ? { path: options.route } : undefined,
    url: options.url ?? "/health",
  } as unknown as Request;
  let contextCorrelationId: string | undefined;
  const logger = new HttpRequestLogger(
    (line) => logs.push(line),
    context,
    () => GENERATED_CORRELATION_ID,
    () => times.shift() ?? 105.8,
  );

  logger.middleware()(
    request,
    response as unknown as Response,
    (() => {
      contextCorrelationId = context.correlationId();
    }) as NextFunction,
  );
  response.finish();

  return {
    responseCorrelationId: response.headers.get("x-correlation-id"),
    contextCorrelationId,
    log: JSON.parse(logs[0] ?? "{}") as Record<string, unknown>,
    serializedLogs: logs.join("\n"),
  };
}

describe("RequestContext", () => {
  test("exposes correlation metadata inside its scope", () => {
    const context = new RequestContext();
    const correlationId = context.run(
      { correlationId: ACCEPTED_CORRELATION_ID },
      () => context.correlationId(),
    );

    expect(correlationId).toBe(ACCEPTED_CORRELATION_ID);
  });

  test("does not expose metadata after its scope completes", () => {
    const context = new RequestContext();
    context.run({ correlationId: ACCEPTED_CORRELATION_ID }, () => {});

    expect(context.correlationId()).toBeUndefined();
  });
});

describe("HttpRequestLogger", () => {
  test("preserves an accepted correlation ID", () => {
    const scenario = createRequestScenario({
      correlationId: ACCEPTED_CORRELATION_ID,
    });

    expect({
      response: scenario.responseCorrelationId,
      context: scenario.contextCorrelationId,
    }).toStrictEqual({
      response: ACCEPTED_CORRELATION_ID,
      context: ACCEPTED_CORRELATION_ID,
    });
  });

  for (const [scenarioName, correlationId] of rejectedCorrelationIdCases) {
    test(`replaces ${scenarioName}`, () => {
      const scenario = createRequestScenario({ correlationId });

      expect(scenario.responseCorrelationId).toBe(GENERATED_CORRELATION_ID);
    });
  }

  test("writes the canonical completed-request log", () => {
    const scenario = createRequestScenario({ route: "/health" });

    expect(scenario.log).toStrictEqual({
      event: "http_request",
      correlationId: GENERATED_CORRELATION_ID,
      method: "GET",
      route: "/health",
      statusCode: 200,
      durationMs: 6,
    });
  });

  test("records an unmatched route without its URL", () => {
    const scenario = createRequestScenario({
      url: "/private?token=secret-password",
    });

    expect(scenario.log.route).toBe("unmatched");
  });

  test("does not log private request values", () => {
    const scenario = createRequestScenario({
      correlationId: "secret-password",
      url: "/private?token=secret-password",
    });

    expect(scenario.serializedLogs).not.toContain("secret-password");
  });
});
