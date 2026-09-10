import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { PrismaActivationOutboxRepository } from "./prisma-activation-outbox.repository";
import {
  type ContractEventPublisher,
  PublishContractActivatedEvent,
} from "./publish-contract-activated-event";

const BATCH_SIZE = 25;
const POLL_MS = 250;
const FAILURE_WAIT_MS = 5_000;
const SHUTDOWN_MS = 5_000;

@Injectable()
export class OutboxPublisher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private running = false;
  private loop?: Promise<void>;
  private wake?: () => void;

  constructor(
    private readonly repository: PrismaActivationOutboxRepository,
    private readonly useCase: PublishContractActivatedEvent,
    private readonly publisher: ContractEventPublisher,
  ) {}

  onApplicationBootstrap(): void {
    this.running = true;
    this.loop = this.run();
  }

  async onApplicationShutdown(): Promise<void> {
    this.running = false;
    this.wake?.();
    if (this.loop)
      await Promise.race([
        this.loop,
        new Promise((resolve) => setTimeout(resolve, SHUTDOWN_MS)),
      ]);
    await this.publisher.close();
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        const events = await this.repository.findDue(new Date(), BATCH_SIZE);
        for (const event of events) {
          if (!this.running) break;
          try {
            const result = await this.useCase.execute(event);
            console.log(
              JSON.stringify({
                event:
                  result === "published"
                    ? "outbox_event_published"
                    : "outbox_event_retry_scheduled",
                eventId: event.eventId,
                correlationId: event.correlationId,
                tenantId: event.tenantId,
                contractId: event.contractId,
              }),
            );
          } catch {
            console.error(
              JSON.stringify({
                event: "outbox_event_mark_failed",
                eventId: event.eventId,
                correlationId: event.correlationId,
              }),
            );
          }
        }
        if (events.length < BATCH_SIZE) await this.wait(POLL_MS);
      } catch {
        console.error(JSON.stringify({ event: "outbox_poll_failed" }));
        await this.wait(FAILURE_WAIT_MS);
      }
    }
  }

  private wait(milliseconds: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, milliseconds);
      this.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    }).finally(() => {
      this.wake = undefined;
    });
  }
}
