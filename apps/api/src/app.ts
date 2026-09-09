import "reflect-metadata";
import { Module, Type, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { HealthController, HealthService } from "./health";

@Module({ controllers: [HealthController], providers: [HealthService] })
export class AppModule {}

import { requestLogging, LogWriter } from "./http";
import { SanitizedErrors } from "./errors";

export async function createApp(
  module: Type = AppModule,
  write: LogWriter = console.log,
) {
  const app = await NestFactory.create(module, {
    logger: false,
    abortOnError: false,
  });

  app.use(requestLogging(write));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      disableErrorMessages: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new SanitizedErrors());

  return app;
}
