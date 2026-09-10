import { connect } from "amqplib";
import {
  CONTRACT_ACTIVATED_DEAD_LETTER_QUEUE,
  CONTRACT_ACTIVATED_PATTERN,
  CONTRACT_ACTIVATED_QUEUE,
  CONTRACT_EVENTS_EXCHANGE,
  NOTIFICATION_DEAD_LETTER_EXCHANGE,
} from "./contract-activated-event";

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
