import "reflect-metadata";
import {
  type DynamicModule,
  type INestApplication,
  Module,
  type NestApplicationOptions,
  type Type,
  ValidationPipe,
  type ValidationPipeOptions,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database";
import { SanitizedErrors } from "./errors";
import { HealthController, HealthService } from "./health";
import {
  BROKER_HEALTH_PROBE,
  DATABASE_HEALTH_PROBE,
  HealthProbeRunner,
  PostgreSqlHealthProbe,
  RabbitMqHealthProbe,
} from "./health-probes";
import { HttpRequestLogger, type LogWriter } from "./http";
import { RuntimeConfigModule } from "./runtime-config";
import { TenantModule } from "./tenant/tenant.module";

@Module({
  imports: [RuntimeConfigModule, DatabaseModule, AuthModule, TenantModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    HealthProbeRunner,
    PostgreSqlHealthProbe,
    RabbitMqHealthProbe,
    {
      provide: DATABASE_HEALTH_PROBE,
      useExisting: PostgreSqlHealthProbe,
    },
    {
      provide: BROKER_HEALTH_PROBE,
      useExisting: RabbitMqHealthProbe,
    },
  ],
})
export class AppModule {}

const NEST_APPLICATION_OPTIONS: NestApplicationOptions = {
  logger: false,
  abortOnError: false,
};

const VALIDATION_OPTIONS: ValidationPipeOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
  disableErrorMessages: true,
  transformOptions: { enableImplicitConversion: false },
};

export type CreateAppOptions = {
  rootModule?: Type | DynamicModule;
  writeLog?: LogWriter;
};

export async function createApp({
  rootModule = AppModule,
  writeLog = console.log,
}: CreateAppOptions = {}): Promise<INestApplication> {
  const app = await NestFactory.create(rootModule, NEST_APPLICATION_OPTIONS);

  configureHttpApplication(app, writeLog);

  return app;
}

function configureHttpApplication(
  app: INestApplication,
  writeLog: LogWriter,
): void {
  const requestLogger = new HttpRequestLogger(writeLog);

  app.use(requestLogger.middleware());
  app.useGlobalPipes(new ValidationPipe(VALIDATION_OPTIONS));
  app.useGlobalFilters(new SanitizedErrors());
}
