import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { STATUS_CODES } from "node:http";
import type { Response } from "express";
import { requestContext } from "./http";

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
    });
  }
}
