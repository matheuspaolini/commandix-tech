import assert from "node:assert/strict";
import { connect } from "amqplib";
import { createPrismaClient } from "@commandix/database";

const exchange = "commandix.contracts";
const route = "contract.activated.v1";
const queue = "commandix.notifications.contract-activated.v1";
const deadLetterExchange = "commandix.notifications.dlx";
const deadLetterQueue = "commandix.notifications.contract-activated.v1.dlq";
const deadlineMs = 20_000;
const client = createPrismaClient();
const connection = await connect(Bun.env.RABBITMQ_URL);
const channel = await connection.createConfirmChannel();

try {
  await assertTopology();
  if (process.argv[2] === "prepare-database-failure") {
    await prepareDatabaseFailure();
  } else if (process.argv[2] === "publish-database-failure") {
    await publishDatabaseFailure();
  } else if (process.argv[2] === "verify-replay") {
    await verifyReplay();
  } else if (process.argv[2] === "publish-only") {
    await publishOnly();
  } else {
    await assertExactTopology();
    await verifyDelivery();
  }
} finally {
  await channel.close();
  await connection.close();
  await client.$disconnect();
}

async function assertTopology() {
  await channel.checkExchange(exchange);
  await channel.checkExchange(deadLetterExchange);
  await channel.checkQueue(queue);
  await channel.checkQueue(deadLetterQueue);
}

async function assertExactTopology() {
  await channel.assertExchange(exchange, "topic", { durable: true });
  await channel.assertExchange(deadLetterExchange, "topic", { durable: true });
  await channel.assertQueue(queue, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": deadLetterExchange,
      "x-dead-letter-routing-key": route,
    },
  });
  await channel.assertQueue(deadLetterQueue, { durable: true });
}

async function verifyDelivery() {
  const fixture = await createFixture();
  const foreignFixture = await createFixture();
  const active = event(fixture.tenantId, fixture.activeContractId, 2);
  const closed = event(fixture.tenantId, fixture.closedContractId, 2);
  await publish(active);
  await publish(closed);
  await waitFor(
    async () =>
      (await client.notificationLog.count({
        where: { eventId: { in: [active.eventId, closed.eventId] } },
      })) === 2,
    "valid Active and Closed notifications",
  );

  await Promise.all([publish(active), publish(active)]);
  await waitFor(
    async () =>
      (await client.notificationLog.count({
        where: { eventId: active.eventId },
      })) === 1,
    "idempotent duplicate delivery",
  );

  const unsupported = {
    ...event(fixture.tenantId, fixture.activeContractId, 2),
    schemaVersion: 2,
  };
  const malformed = {
    ...event(fixture.tenantId, fixture.activeContractId, 2),
    values: { private: "notification-secret-sentinel" },
  };
  const missing = event(fixture.tenantId, crypto.randomUUID(), 2);
  const foreign = event(foreignFixture.tenantId, fixture.activeContractId, 2);
  const future = event(fixture.tenantId, fixture.activeContractId, 3);
  const conflict = { ...active, correlationId: crypto.randomUUID() };
  for (const failed of [
    unsupported,
    malformed,
    missing,
    foreign,
    future,
    conflict,
  ])
    await publish(failed);
  const progress = event(fixture.tenantId, fixture.activeContractId, 2);
  await publish(progress);
  await waitFor(
    async () =>
      (await client.notificationLog.count({
        where: { eventId: progress.eventId },
      })) === 1,
    "valid delivery after failed events",
  );

  const failedIds = [
    unsupported.eventId,
    malformed.eventId,
    missing.eventId,
    foreign.eventId,
    future.eventId,
    conflict.eventId,
  ];
  const deadLetters = await takeDeadLetters(failedIds.length);
  assert.deepEqual(
    new Set(deadLetters.map((item) => item.data.eventId)),
    new Set(failedIds),
  );
  assert.equal(
    await client.notificationLog.count({
      where: { eventId: { in: failedIds.slice(0, -1) } },
    }),
    0,
  );
  console.log(
    "RabbitMQ delivery, Closed reference, idempotency, DLQ, and progress verified",
  );
}

async function prepareDatabaseFailure() {
  const fixture = await createFixture();
  const activation = event(fixture.tenantId, fixture.activeContractId, 2);
  await Bun.write(
    "/app/notification-replay-event.json",
    JSON.stringify(activation),
  );
  console.log(JSON.stringify({ eventId: activation.eventId }));
}

async function publishDatabaseFailure() {
  const activation = await Bun.file(
    "/app/notification-replay-event.json",
  ).json();
  await publish(activation);
  const deadLetters = await takeDeadLetters(1);
  assert.equal(deadLetters[0].data.eventId, activation.eventId);
  assert.equal(
    await client.notificationLog.count({
      where: { eventId: activation.eventId },
    }),
    0,
  );
}

async function verifyReplay() {
  const activation = await Bun.file(
    "/app/notification-replay-event.json",
  ).json();
  await waitFor(
    async () =>
      (await client.notificationLog.count({
        where: { eventId: activation.eventId },
      })) === 1,
    "replayed notification",
  );
  assert.equal(
    await client.notificationLog.count({
      where: { eventId: activation.eventId },
    }),
    1,
  );
}

async function publishOnly() {
  const activation = await Bun.file(
    "/app/notification-replay-event.json",
  ).json();
  await publish(activation);
}

async function createFixture() {
  const tenant = await client.tenant.create({
    data: { slug: `broker-${crypto.randomUUID()}` },
  });
  const logical = await client.logicalTemplate.create({
    data: { tenantId: tenant.id },
  });
  const version = await client.templateVersion.create({
    data: {
      tenantId: tenant.id,
      logicalTemplateId: logical.id,
      definition: { fields: [] },
    },
  });
  const [active, closed] = await Promise.all([
    client.contract.create({
      data: {
        tenantId: tenant.id,
        templateVersionId: version.id,
        status: "ACTIVE",
        revision: 2,
        values: {},
        createdAt: new Date(),
      },
    }),
    client.contract.create({
      data: {
        tenantId: tenant.id,
        templateVersionId: version.id,
        status: "CLOSED",
        revision: 3,
        values: {},
        createdAt: new Date(),
      },
    }),
  ]);
  return {
    tenantId: tenant.id,
    activeContractId: active.id,
    closedContractId: closed.id,
  };
}

function event(tenantId, contractId, activationRevision) {
  return {
    eventId: crypto.randomUUID(),
    eventType: "contract.activated",
    schemaVersion: 1,
    tenantId,
    contractId,
    activationRevision,
    occurredAt: "2026-09-10T14:03:22.123Z",
    correlationId: crypto.randomUUID(),
  };
}

async function publish(data) {
  channel.publish(
    exchange,
    route,
    Buffer.from(JSON.stringify({ pattern: route, data })),
    {
      persistent: true,
      mandatory: true,
      contentType: "application/json",
      messageId: data.eventId,
      correlationId: data.correlationId,
    },
  );
  await channel.waitForConfirms();
}

async function takeDeadLetters(count) {
  const deliveries = [];
  await waitFor(async () => {
    while (deliveries.length < count) {
      const delivery = await channel.get(deadLetterQueue, { noAck: false });
      if (!delivery) break;
      deliveries.push(JSON.parse(delivery.content.toString()));
      channel.ack(delivery);
    }
    return deliveries.length === count;
  }, `${count} dead-letter deliveries`);
  return deliveries;
}

async function waitFor(predicate, description) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await Bun.sleep(50);
  }
  throw new Error(`Timed out waiting for ${description}`);
}
