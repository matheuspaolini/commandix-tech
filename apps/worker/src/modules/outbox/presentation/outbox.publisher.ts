import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { PublishContractActivatedEvent } from "@/modules/outbox/application/publish-contract-activated-event/publish-contract-activated-event";

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

  constructor(private readonly useCase: PublishContractActivatedEvent) {}

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
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        const results = await this.useCase.execute({ limit: BATCH_SIZE });
        for (const { event, outcome } of results) {
          if (!this.running) break;
          if (outcome === "unexpected_failure") {
            console.error(
              JSON.stringify({
                event: "outbox_event_mark_failed",
                eventId: event.eventId,
                correlationId: event.correlationId,
              }),
            );
            continue;
          }
          console.log(
            JSON.stringify({
              event:
                outcome === "published"
                  ? "outbox_event_published"
                  : "outbox_event_retry_scheduled",
              eventId: event.eventId,
              correlationId: event.correlationId,
              tenantId: event.tenantId,
              contractId: event.contractId,
            }),
          );
        }
        if (results.length < BATCH_SIZE) await this.wait(POLL_MS);
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
