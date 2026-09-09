import { createApp } from "./app";

async function main() {
  if (!process.env.DATABASE_URL || !process.env.RABBITMQ_URL) {
    throw new Error("Missing runtime configuration");
  }
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(3000, "0.0.0.0");
  console.log(JSON.stringify({ event: "api_started", port: 3000 }));
}

void main().catch(() => {
  console.error(JSON.stringify({ event: "api_start_failed" }));
  process.exitCode = 1;
});
