export type ContractRegisterBoundary = {
  createdAt: Date;
  id: string;
};

type ContractRegisterCursorV1 = {
  v: 1;
  createdAt: string;
  id: string;
};

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class InvalidContractPagination extends Error {}

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
  cursor: string | undefined,
): ContractRegisterBoundary | null {
  if (cursor === undefined) return null;

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
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).sort().join(",") === "createdAt,id,v" &&
    candidate.v === 1 &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.id === "string" &&
    UUID_V4.test(candidate.id)
  );
}
