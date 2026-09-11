import { connect, type ConfirmChannel } from "amqplib";
import {
  CONTRACT_ACTIVATED_PATTERN,
  CONTRACT_EVENTS_EXCHANGE,
  parseContractActivatedEvent,
  toContractActivatedEnvelope,
} from "@commandix/contract-events";
import { workerRuntimeConfigFromEnvironment } from "@/platform/runtime-config";

const CONFIRM_TIMEOUT_MS = 5_000;

async function replay(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath || process.argv.length !== 3)
    throw new Error("invalid_arguments");
  const event = parseContractActivatedEvent(await Bun.file(filePath).json());
  const envelope = toContractActivatedEnvelope({
    ...event,
    occurredAt: event.occurredAt.toISOString(),
  });
  const { rabbitMqUrl } = workerRuntimeConfigFromEnvironment();
  const connection = await connect(rabbitMqUrl);
  try {
    const channel = await connection.createConfirmChannel();
    try {
      await publishConfirmed(
        channel,
        envelope,
        event.eventId,
        event.correlationId,
      );
    } finally {
      await channel.close();
    }
  } finally {
    await connection.close();
  }
  console.log(
    JSON.stringify({
      event: "activation_event_replayed",
      eventId: event.eventId,
      correlationId: event.correlationId,
    }),
  );
}

async function publishConfirmed(
  channel: ConfirmChannel,
  envelope: object,
  eventId: string,
  correlationId: string,
): Promise<void> {
  let returned = false;
  channel.once("return", () => {
    returned = true;
  });
  channel.publish(
    CONTRACT_EVENTS_EXCHANGE,
    CONTRACT_ACTIVATED_PATTERN,
    Buffer.from(JSON.stringify(envelope)),
    {
      persistent: true,
      mandatory: true,
      contentType: "application/json",
      messageId: eventId,
      correlationId,
    },
  );
  await Promise.race([
    channel.waitForConfirms(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("confirmation_timeout")),
        CONFIRM_TIMEOUT_MS,
      ),
    ),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (returned) throw new Error("unroutable");
}

void replay().catch(() => {
  console.error(JSON.stringify({ event: "activation_event_replay_failed" }));
  process.exitCode = 1;
});
