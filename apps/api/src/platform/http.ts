import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

const CORRELATION_ID_HEADER = "x-correlation-id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RequestMetadata = {
  correlationId: string;
};

export type LogWriter = (line: string) => void;

type CorrelationIdGenerator = () => string;
type MonotonicClock = () => number;

type HttpRequestLog = {
  event: "http_request";
  correlationId: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
};

export class RequestContext {
  private readonly storage = new AsyncLocalStorage<RequestMetadata>();

  run<T>(metadata: RequestMetadata, callback: () => T): T {
    return this.storage.run(metadata, callback);
  }

  correlationId(): string | undefined {
    return this.storage.getStore()?.correlationId;
  }
}

export const requestContext = new RequestContext();

export class HttpRequestLogger {
  constructor(
    private readonly write: LogWriter,
    private readonly context: RequestContext = requestContext,
    private readonly generateCorrelationId: CorrelationIdGenerator = createCorrelationId,
    private readonly now: MonotonicClock = performance.now.bind(performance),
  ) {}

  middleware() {
    return (request: Request, response: Response, next: NextFunction): void => {
      const correlationId = this.resolveCorrelationId(request);
      const startedAt = this.now();

      response.setHeader(CORRELATION_ID_HEADER, correlationId);
      response.once("finish", () => {
        this.writeCompletedRequest(request, response, correlationId, startedAt);
      });

      this.context.run({ correlationId }, next);
    };
  }

  private resolveCorrelationId(request: Request): string {
    const incoming = request.headers[CORRELATION_ID_HEADER];

    return typeof incoming === "string" && UUID.test(incoming)
      ? incoming
      : this.generateCorrelationId();
  }

  private writeCompletedRequest(
    request: Request,
    response: Response,
    correlationId: string,
    startedAt: number,
  ): void {
    const log: HttpRequestLog = {
      event: "http_request",
      correlationId,
      method: request.method,
      route: request.route?.path ?? "unmatched",
      statusCode: response.statusCode,
      durationMs: Math.round(this.now() - startedAt),
    };

    this.write(serializeLog(log));
  }
}

function createCorrelationId(): string {
  return crypto.randomUUID();
}

function serializeLog(log: HttpRequestLog): string {
  return JSON.stringify(log);
}
