import {
  CONTRACT_ACTIVATED_PATTERN,
  CONTRACT_EVENTS_EXCHANGE,
  toContractActivatedEnvelope,
} from "@commandix/contract-events";
import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type Message,
} from "amqplib";
import type {
  ContractEventPublisher,
  OutboxEvent,
} from "@/outbox/application/publish-contract-activated-event/publish-contract-activated-event";

export class RabbitMqContractEventPublisher implements ContractEventPublisher {
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;

  constructor(
    private readonly rabbitMqUrl: string,
    private readonly confirmTimeoutMs: number,
  ) {}

  async publish(event: OutboxEvent): Promise<void> {
    const channel = await this.confirmChannel();
    const envelope = toContractActivatedEnvelope({
      ...event,
      occurredAt: event.occurredAt.toISOString(),
    });
    try {
      await confirmedPublish(channel, event, envelope, this.confirmTimeoutMs);
    } catch (error) {
      if (
        error instanceof Error &&
        ["CONFIRM_TIMEOUT", "CONNECTION_LOST"].includes(error.message)
      )
        await this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.channel = undefined;
    this.connection = undefined;
    await channel?.close().catch(() => {});
    await connection?.close().catch(() => {});
  }

  private async confirmChannel(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    try {
      this.connection = await connect(this.rabbitMqUrl);
      this.connection.once("close", () => {
        this.channel = undefined;
        this.connection = undefined;
      });
      this.channel = await this.connection.createConfirmChannel();
      return this.channel;
    } catch {
      await this.close();
      throw new Error("CONNECTION_LOST");
    }
  }
}

function confirmedPublish(
  channel: ConfirmChannel,
  event: OutboxEvent,
  envelope: object,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let returned = false;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.off("return", onReturn);
      channel.off("close", onClose);
      channel.off("error", onClose);
      error ? reject(error) : resolve();
    };
    const onReturn = (message: Message) => {
      if (message.properties.messageId === event.eventId) returned = true;
    };
    const onClose = () => finish(new Error("CONNECTION_LOST"));
    const timer = setTimeout(
      () => finish(new Error("CONFIRM_TIMEOUT")),
      timeoutMs,
    );
    channel.on("return", onReturn);
    channel.once("close", onClose);
    channel.once("error", onClose);
    channel.publish(
      CONTRACT_EVENTS_EXCHANGE,
      CONTRACT_ACTIVATED_PATTERN,
      Buffer.from(JSON.stringify(envelope)),
      {
        mandatory: true,
        persistent: true,
        contentType: "application/json",
        messageId: event.eventId,
        correlationId: event.correlationId,
      },
      (error) => {
        setTimeout(() => {
          if (returned) finish(new Error("RETURNED"));
          else if (error) finish(new Error("NACKED"));
          else finish();
        }, 0);
      },
    );
  });
}
