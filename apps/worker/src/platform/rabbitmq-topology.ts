import { connect } from "amqplib";
import {
  CONTRACT_ACTIVATED_PATTERN,
  CONTRACT_EVENTS_EXCHANGE,
} from "@commandix/contract-events";

export const CONTRACT_ACTIVATED_QUEUE =
  "commandix.notifications.contract-activated.v1";
export const NOTIFICATION_DEAD_LETTER_EXCHANGE = "commandix.notifications.dlx";
export const CONTRACT_ACTIVATED_DEAD_LETTER_QUEUE =
  "commandix.notifications.contract-activated.v1.dlq";

export class RabbitMqTopology {
  constructor(private readonly rabbitMqUrl: string) {}

  async declare(): Promise<void> {
    const connection = await connect(this.rabbitMqUrl);
    try {
      const channel = await connection.createChannel();
      try {
        await channel.assertExchange(CONTRACT_EVENTS_EXCHANGE, "topic", {
          durable: true,
        });
        await channel.assertExchange(
          NOTIFICATION_DEAD_LETTER_EXCHANGE,
          "topic",
          { durable: true },
        );
        await channel.assertQueue(CONTRACT_ACTIVATED_QUEUE, {
          durable: true,
          arguments: {
            "x-dead-letter-exchange": NOTIFICATION_DEAD_LETTER_EXCHANGE,
            "x-dead-letter-routing-key": CONTRACT_ACTIVATED_PATTERN,
          },
        });
        await channel.bindQueue(
          CONTRACT_ACTIVATED_QUEUE,
          CONTRACT_EVENTS_EXCHANGE,
          CONTRACT_ACTIVATED_PATTERN,
        );
        await channel.assertQueue(CONTRACT_ACTIVATED_DEAD_LETTER_QUEUE, {
          durable: true,
        });
        await channel.bindQueue(
          CONTRACT_ACTIVATED_DEAD_LETTER_QUEUE,
          NOTIFICATION_DEAD_LETTER_EXCHANGE,
          CONTRACT_ACTIVATED_PATTERN,
        );
      } finally {
        await channel.close();
      }
    } finally {
      await connection.close();
    }
  }
}
