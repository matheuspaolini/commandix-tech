import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { STATUS_CODES } from "node:http";
import type { Response } from "express";
import { requestContext } from "./http";

export type PublicErrorBody = {
  code:
    | "ACTIVE_TEMPLATE_REQUIRED"
    | "INVALID_CONTRACT_VALUES"
    | "INVALID_PAGINATION"
    | "CONTRACT_NOT_FOUND"
    | "CONTRACT_REVISION_CONFLICT"
    | "CONTRACT_STATUS_CONFLICT"
    | "TEMPLATE_VERSION_NOT_FOUND"
    | "TEMPLATE_VERSION_NOT_ACTIVE"
    | "INVALID_TEMPLATE_DEFINITION"
    | "TEMPLATE_REVISION_CONFLICT";
  issues?: { key?: string; code: string }[];
};

export class PublicHttpException extends HttpException {
  constructor(
    status: number,
    readonly publicBody: PublicErrorBody,
  ) {
    super(publicBody, status);
  }
}

@Catch()
export class SanitizedErrors implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : 500;
    response.status(statusCode).json({
      statusCode,
      error: STATUS_CODES[statusCode] ?? "Internal Server Error",
      correlationId: requestContext.correlationId(),
      ...(exception instanceof PublicHttpException ? exception.publicBody : {}),
    });
  }
}
