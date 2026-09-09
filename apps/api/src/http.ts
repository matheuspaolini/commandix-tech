import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const requestContext = new AsyncLocalStorage<{
  correlationId: string;
}>();
export type LogWriter = (line: string) => void;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestLogging(write: LogWriter) {
  return (request: Request, response: Response, next: NextFunction) => {
    const incoming = request.headers["x-correlation-id"];
    const correlationId =
      typeof incoming === "string" && UUID.test(incoming)
        ? incoming
        : randomUUID();
    response.setHeader("x-correlation-id", correlationId);
    const start = performance.now();
    response.once("finish", () => {
      write(
        JSON.stringify({
          event: "http_request",
          correlationId,
          method: request.method,
          route: request.route?.path ?? "unmatched",
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - start),
        }),
      );
    });
    requestContext.run({ correlationId }, next);
  };
}
