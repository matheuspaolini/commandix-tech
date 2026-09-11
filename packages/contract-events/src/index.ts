export const CONTRACT_ACTIVATED_EVENT_TYPE = "contract.activated";
export const CONTRACT_ACTIVATED_SCHEMA_VERSION = 1;
export const CONTRACT_ACTIVATED_PATTERN = "contract.activated.v1";
export const CONTRACT_EVENTS_EXCHANGE = "commandix.contracts";

const EVENT_FIELDS = new Set([
  "eventId",
  "eventType",
  "schemaVersion",
  "tenantId",
  "contractId",
  "activationRevision",
  "occurredAt",
  "correlationId",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type ContractActivatedEventV1 = {
  eventId: string;
  eventType: typeof CONTRACT_ACTIVATED_EVENT_TYPE;
  schemaVersion: typeof CONTRACT_ACTIVATED_SCHEMA_VERSION;
  tenantId: string;
  contractId: string;
  activationRevision: number;
  occurredAt: string;
  correlationId: string;
};

export type ContractActivatedEnvelope = {
  pattern: typeof CONTRACT_ACTIVATED_PATTERN;
  data: ContractActivatedEventV1;
};

export type ValidatedContractActivatedEvent = Omit<
  ContractActivatedEventV1,
  "occurredAt"
> & { occurredAt: Date };

export class ContractActivatedEventValidationError extends Error {
  constructor() {
    super("Contract-activated event is invalid");
  }
}

export function parseContractActivatedEvent(
  input: unknown,
): ValidatedContractActivatedEvent {
  if (!isExactEventObject(input) || !hasValidFields(input))
    throw new ContractActivatedEventValidationError();
  const occurredAt = parseOccurredAt(input.occurredAt);
  if (!occurredAt) throw new ContractActivatedEventValidationError();
  return { ...input, occurredAt };
}

export function toContractActivatedEnvelope(
  event: ContractActivatedEventV1,
): ContractActivatedEnvelope {
  return { pattern: CONTRACT_ACTIVATED_PATTERN, data: event };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function hasValidFields(
  input: Record<string, unknown>,
): input is ContractActivatedEventV1 {
  return (
    isUuid(input.eventId) &&
    input.eventType === CONTRACT_ACTIVATED_EVENT_TYPE &&
    input.schemaVersion === CONTRACT_ACTIVATED_SCHEMA_VERSION &&
    isUuid(input.tenantId) &&
    isUuid(input.contractId) &&
    typeof input.activationRevision === "number" &&
    Number.isSafeInteger(input.activationRevision) &&
    input.activationRevision > 0 &&
    typeof input.occurredAt === "string" &&
    isUuid(input.correlationId)
  );
}

function isExactEventObject(input: unknown): input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return false;
  const keys = Object.keys(input);
  return (
    keys.length === EVENT_FIELDS.size &&
    keys.every((key) => EVENT_FIELDS.has(key))
  );
}

function parseOccurredAt(value: unknown): Date | undefined {
  if (typeof value !== "string" || !UTC_TIMESTAMP.test(value)) return undefined;
  const occurredAt = new Date(value);
  return Number.isNaN(occurredAt.valueOf()) ||
    occurredAt.toISOString() !== value
    ? undefined
    : occurredAt;
}
