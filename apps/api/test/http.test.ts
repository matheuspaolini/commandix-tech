import { afterAll as after, beforeAll as before, test } from "bun:test";
import assert from "node:assert/strict";
import {
  Body,
  Controller,
  Get,
  INestApplication,
  Module,
  Post,
} from "@nestjs/common";
import { IsString } from "class-validator";
import request from "supertest";
import { AppModule, createApp } from "../src/app";

class ProbeDto {
  @IsString()
  name!: string;
}
@Controller("test-only")
class ProbeController {
  @Post()
  validate(@Body() body: ProbeDto) {
    return body;
  }
  @Get("unexpected")
  unexpected() {
    throw new Error("secret-password snapshot-private-value");
  }
}
@Module({ imports: [AppModule], controllers: [ProbeController] })
class TestModule {}

const logs: string[] = [];
let app: INestApplication;
before(async () => {
  app = await createApp(TestModule, (line) => logs.push(line));
  await app.init();
});
after(async () => {
  await app?.close();
});

test("health verifies the database and broker", async () => {
  const response = await request(app.getHttpServer()).get("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    status: "ok",
    dependencies: { database: "up", broker: "up" },
  });
});

test("requests generate and return a correlation UUID", async () => {
  const response = await request(app.getHttpServer()).get("/health");
  assert.match(
    response.headers["x-correlation-id"] ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("invalid DTOs return sanitized correlated errors", async () => {
  const correlationId = "ae68edcd-e14f-4e0f-8a56-0c61d91b069e";
  const response = await request(app.getHttpServer())
    .post("/test-only")
    .set("x-correlation-id", correlationId)
    .send({
      name: { password: "secret-password" },
      snapshot: "snapshot-private-value",
    });
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    statusCode: 400,
    error: "Bad Request",
    correlationId,
  });
  assert.equal(response.headers["x-correlation-id"], correlationId);
  const log = JSON.parse(logs.at(-1)!);
  assert.equal(log.correlationId, correlationId);
  assert.equal(log.statusCode, 400);
  assert.doesNotMatch(
    logs.join("\n"),
    /secret-password|snapshot-private-value|stack/,
  );
});

test("unexpected exceptions omit internal messages and stacks", async () => {
  const response = await request(app.getHttpServer())
    .get("/test-only/unexpected?token=secret-password")
    .set("authorization", "Bearer secret-password")
    .set("cookie", "refresh=secret-password");
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    statusCode: 500,
    error: "Internal Server Error",
    correlationId: response.headers["x-correlation-id"],
  });
  const log = JSON.parse(logs.at(-1)!);
  assert.equal(log.correlationId, response.body.correlationId);
  assert.equal(log.statusCode, 500);
  assert.doesNotMatch(
    JSON.stringify(response.body) + logs.join("\n"),
    /secret-password|snapshot-private-value|stack/,
  );
});

test("accepted IDs propagate through a successful request and JSON log", async () => {
  const correlationId = "AE68EDCD-E14F-4E0F-8A56-0C61D91B069E";
  const response = await request(app.getHttpServer())
    .get("/health")
    .set("x-correlation-id", correlationId);
  assert.equal(response.status, 200);
  assert.equal(response.headers["x-correlation-id"], correlationId);
  const log = JSON.parse(logs.at(-1)!);
  assert.equal(log.correlationId, correlationId);
  assert.equal(log.route, "/health");
  assert.equal(log.event, "http_request");
});

test("unaccepted IDs are replaced and unmatched URLs are not logged", async () => {
  const response = await request(app.getHttpServer())
    .get("/secret-password?value=snapshot-private-value")
    .set("x-correlation-id", "secret-password");
  assert.equal(response.status, 404);
  assert.match(response.headers["x-correlation-id"] ?? "", /^[0-9a-f-]{36}$/);
  assert.equal(
    response.body.correlationId,
    response.headers["x-correlation-id"],
  );
  assert.equal(JSON.parse(logs.at(-1)!).route, "unmatched");
  assert.doesNotMatch(
    logs.join("\n"),
    /secret-password|snapshot-private-value/,
  );
});

test("validation rejects unknown properties and implicit scalar conversion", async () => {
  for (const body of [{ name: "valid", extra: true }, { name: 123 }, {}]) {
    const response = await request(app.getHttpServer())
      .post("/test-only")
      .send(body);
    assert.equal(response.status, 400);
  }
  const valid = await request(app.getHttpServer())
    .post("/test-only")
    .send({ name: "valid" });
  assert.equal(valid.status, 201);
  assert.deepEqual(valid.body, { name: "valid" });
});

test("malformed JSON still receives a sanitized correlated error", async () => {
  const response = await request(app.getHttpServer())
    .post("/test-only")
    .set("Content-Type", "application/json")
    .send('{"secret-password":');
  assert.equal(response.status, 400);
  assert.equal(
    response.body.correlationId,
    response.headers["x-correlation-id"],
  );
  assert.equal(
    JSON.parse(logs.at(-1)!).correlationId,
    response.body.correlationId,
  );
  assert.doesNotMatch(
    JSON.stringify(response.body) + logs.join("\n"),
    /secret-password|stack/,
  );
});

test("production does not expose test-only routes", async () => {
  const production = await createApp(AppModule, () => {});
  await production.init();
  try {
    assert.equal(
      (
        await request(production.getHttpServer())
          .post("/test-only")
          .send({ name: "valid" })
      ).status,
      404,
    );
    assert.equal(
      (await request(production.getHttpServer()).get("/test-only/unexpected"))
        .status,
      404,
    );
  } finally {
    await production.close();
  }
});
