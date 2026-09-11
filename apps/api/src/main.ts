import { createApiModule, createApp } from "./app";
import { runtimeConfigFromEnvironment } from "./runtime-config";

const API_SERVER = {
  host: "0.0.0.0",
  port: 3_000,
} as const;

const API_STARTED_EVENT = {
  event: "api_started",
  port: API_SERVER.port,
} as const;

const API_START_FAILED_EVENT = {
  event: "api_start_failed",
} as const;

async function bootstrap(): Promise<void> {
  const app = await createApp({
    rootModule: createApiModule(runtimeConfigFromEnvironment()),
  });

  app.enableShutdownHooks();
  await app.listen(API_SERVER.port, API_SERVER.host);
  writeLog(API_STARTED_EVENT);
}

function writeLog(event: object): void {
  console.log(JSON.stringify(event));
}

function reportStartupFailure(): void {
  console.error(JSON.stringify(API_START_FAILED_EVENT));
  process.exitCode = 1;
}

void bootstrap().catch(reportStartupFailure);
