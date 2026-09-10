import { describe, expect, test } from "bun:test";
import {
  ContractActivatedEventValidationError,
  parseContractActivatedEvent,
} from "../src/notification/contract-activated-event";

const VALID_EVENT = {
  eventId: "0d087f87-0177-41ce-a705-ffb33d160fb8",
  eventType: "contract.activated",
  schemaVersion: 1,
  tenantId: "a6819601-e52a-4c5c-b875-dae3b7b876d6",
  contractId: "97b729df-5520-4be2-8752-fcb09ba6f312",
  activationRevision: 2,
  occurredAt: "2026-09-10T14:03:22.123Z",
  correlationId: "AE68EDCD-E14F-4E0F-8A56-0C61D91B069E",
} as const;

describe("Contract-activated event contract", () => {
  test("parses the exact version-one wire contract", () => {
    const parsed = parseContractActivatedEvent(VALID_EVENT);

    expect(parsed).toStrictEqual({
      ...VALID_EVENT,
      occurredAt: new Date("2026-09-10T14:03:22.123Z"),
    });
  });

  test.each([
    ["an unknown field", { ...VALID_EVENT, values: {} }],
    ["a missing field", { ...VALID_EVENT, contractId: undefined }],
    ["an unsupported type", { ...VALID_EVENT, eventType: "contract.closed" }],
    ["an unsupported version", { ...VALID_EVENT, schemaVersion: 2 }],
    ["an invalid UUID", { ...VALID_EVENT, eventId: "not-a-uuid" }],
    ["a zero revision", { ...VALID_EVENT, activationRevision: 0 }],
    ["a fractional revision", { ...VALID_EVENT, activationRevision: 1.5 }],
    ["an unsafe revision", { ...VALID_EVENT, activationRevision: 2 ** 53 }],
    [
      "a timestamp offset",
      { ...VALID_EVENT, occurredAt: "2026-09-10T11:03:22.123-03:00" },
    ],
    [
      "missing milliseconds",
      { ...VALID_EVENT, occurredAt: "2026-09-10T14:03:22Z" },
    ],
    [
      "an impossible date",
      { ...VALID_EVENT, occurredAt: "2026-02-30T14:03:22.123Z" },
    ],
  ])("rejects %s", (_scenario, input) => {
    expect(() => parseContractActivatedEvent(input)).toThrow(
      ContractActivatedEventValidationError,
    );
  });
});
