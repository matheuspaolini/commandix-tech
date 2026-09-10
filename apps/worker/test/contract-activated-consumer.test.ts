import { describe, expect, test } from "bun:test";
import type { RmqContext } from "@nestjs/microservices";
import { ContractActivatedConsumer } from "../src/notification/contract-activated.consumer";
import {
  ContractReferenceInvalidError,
  ProcessContractActivatedEvent,
} from "../src/notification/process-contract-activated-event";

const EVENT = {
  eventId: "0d087f87-0177-41ce-a705-ffb33d160fb8",
  eventType: "contract.activated",
  schemaVersion: 1,
  tenantId: "a6819601-e52a-4c5c-b875-dae3b7b876d6",
  contractId: "97b729df-5520-4be2-8752-fcb09ba6f312",
  activationRevision: 2,
  occurredAt: "2026-09-10T14:03:22.123Z",
  correlationId: "AE68EDCD-E14F-4E0F-8A56-0C61D91B069E",
} as const;

describe("Contract-activated RabbitMQ settlement", () => {
  test("acknowledges only after processing completes", async () => {
    const calls: string[] = [];
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const consumer = new ContractActivatedConsumer(
      new ProcessContractActivatedEvent(
        {
          record: async () => {
            calls.push("processing");
            await pending;
            calls.push("persisted");
            return "created";
          },
        },
        undefined,
        () => {},
      ),
    );
    const consumption = consumer.consume(EVENT, context(calls));
    await Promise.resolve();
    finish();
    await consumption;

    expect(calls).toStrictEqual(["processing", "persisted", "ack"]);
  });

  test("rejects a processing failure without requeue", async () => {
    const calls: string[] = [];
    const consumer = new ContractActivatedConsumer(
      new ProcessContractActivatedEvent(
        {
          record: async () =>
            Promise.reject(new ContractReferenceInvalidError()),
        },
        undefined,
        () => {},
      ),
    );

    await consumer.consume(EVENT, context(calls));

    expect(calls).toStrictEqual(["nack:false:false"]);
  });
});

function context(calls: string[]): RmqContext {
  const message = {};
  return {
    getMessage: () => message,
    getChannelRef: () => ({
      ack: (received: object) =>
        calls.push(received === message ? "ack" : "wrong"),
      nack: (received: object, all: boolean, requeue: boolean) =>
        calls.push(received === message ? `nack:${all}:${requeue}` : "wrong"),
    }),
  } as RmqContext;
}
