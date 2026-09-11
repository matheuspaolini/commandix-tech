import {
  CONTRACT_REGISTER_DEFAULT_LIMIT,
  CONTRACT_REGISTER_MAX_LIMIT,
  type ContractRegisterBoundary,
} from "@/modules/contract/application/list-contracts/list-contracts";

type ContractRegisterCursorV1 = {
  v: 1;
  createdAt: string;
  id: string;
};

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class InvalidContractPagination extends Error {}

export function parseContractRegisterQuery(query: Record<string, unknown>): {
  limit: number;
  after: ContractRegisterBoundary | null;
} {
  if (!hasOnlyPaginationParameters(query))
    throw new InvalidContractPagination();
  const limitValue = query.limit;
  const afterValue = query.after;
  if (!isPositiveDecimalLimit(limitValue))
    throw new InvalidContractPagination();
  if (!isOptionalNonEmptyString(afterValue))
    throw new InvalidContractPagination();
  const limit =
    limitValue === undefined
      ? CONTRACT_REGISTER_DEFAULT_LIMIT
      : Number(limitValue);
  if (!Number.isSafeInteger(limit) || limit > CONTRACT_REGISTER_MAX_LIMIT)
    throw new InvalidContractPagination();
  return {
    limit,
    after:
      typeof afterValue === "string"
        ? decodeContractRegisterCursor(afterValue)
        : null,
  };
}

export function toContractRegisterResponse(page: {
  items: ReadonlyArray<{
    id: string;
    status: string;
    revision: number;
    createdAt: Date;
  }>;
  next: ContractRegisterBoundary | null;
}) {
  return {
    items: page.items.map((contract) => ({
      ...contract,
      createdAt: contract.createdAt.toISOString(),
    })),
    nextCursor: page.next ? encodeContractRegisterCursor(page.next) : null,
  };
}

export function encodeContractRegisterCursor(
  boundary: ContractRegisterBoundary,
): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      createdAt: boundary.createdAt.toISOString(),
      id: boundary.id,
    } satisfies ContractRegisterCursorV1),
  ).toString("base64url");
}

export function decodeContractRegisterCursor(
  cursor: string,
): ContractRegisterBoundary {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("Invalid base64url");
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const value: unknown = JSON.parse(decoded);
    if (!isCursor(value)) throw new Error("Invalid cursor payload");
    const createdAt = new Date(value.createdAt);
    if (createdAt.toISOString() !== value.createdAt)
      throw new Error("Non-canonical timestamp");
    const boundary = { createdAt, id: value.id };
    if (encodeContractRegisterCursor(boundary) !== cursor)
      throw new Error("Non-canonical cursor");
    return boundary;
  } catch {
    throw new InvalidContractPagination();
  }
}

function isCursor(value: unknown): value is ContractRegisterCursorV1 {
  if (!isRecord(value)) return false;
  const candidate = value;
  return (
    hasExactCursorFields(candidate) &&
    candidate.v === 1 &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.id === "string" &&
    UUID_V4.test(candidate.id)
  );
}

function hasOnlyPaginationParameters(query: Record<string, unknown>): boolean {
  return Object.keys(query).every((key) => key === "limit" || key === "after");
}

function isPositiveDecimalLimit(value: unknown): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === "string" && /^[1-9]\d*$/.test(value))
  );
}

function isOptionalNonEmptyString(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactCursorFields(candidate: Record<string, unknown>): boolean {
  return Object.keys(candidate).sort().join(",") === "createdAt,id,v";
}
