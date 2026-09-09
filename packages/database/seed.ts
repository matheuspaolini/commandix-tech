import { Client } from "pg";

async function seed() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
  });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("SELECT 1");
    console.log(JSON.stringify({ event: "seed_completed", domainData: false }));
  } finally {
    await client.end();
  }
}

void seed().catch(() => {
  console.error(JSON.stringify({ event: "seed_failed" }));
  process.exitCode = 1;
});
