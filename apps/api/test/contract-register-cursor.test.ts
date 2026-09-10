import { describe, expect, test } from "bun:test";
import {
  decodeContractRegisterCursor,
  encodeContractRegisterCursor,
  InvalidContractPagination,
} from "../src/contract/contract-register-cursor";

const boundary = {
  createdAt: new Date("2026-09-11T12:30:00.000Z"),
  id: "8c3272ba-5192-4d55-817d-13f041850945",
};

test("round-trips a canonical opaque register boundary", () => {
  const cursor = encodeContractRegisterCursor(boundary);
  expect(decodeContractRegisterCursor(cursor)).toEqual(boundary);
});

describe("invalid Contract register cursors", () => {
  for (const [name, cursor] of [
    ["empty", ""],
    ["invalid base64url", "not+padded="],
    ["invalid JSON", Buffer.from("nope").toString("base64url")],
    [
      "unsupported version",
      Buffer.from(
        JSON.stringify({
          v: 2,
          createdAt: boundary.createdAt.toISOString(),
          id: boundary.id,
        }),
      ).toString("base64url"),
    ],
    [
      "extra property",
      Buffer.from(
        JSON.stringify({
          v: 1,
          createdAt: boundary.createdAt.toISOString(),
          id: boundary.id,
          tenantId: "foreign",
        }),
      ).toString("base64url"),
    ],
    [
      "invalid date",
      Buffer.from(
        JSON.stringify({ v: 1, createdAt: "yesterday", id: boundary.id }),
      ).toString("base64url"),
    ],
    [
      "invalid ID",
      Buffer.from(
        JSON.stringify({
          v: 1,
          createdAt: boundary.createdAt.toISOString(),
          id: "contract",
        }),
      ).toString("base64url"),
    ],
  ] as const) {
    test(`rejects ${name}`, () => {
      expect(() => decodeContractRegisterCursor(cursor)).toThrow(
        InvalidContractPagination,
      );
    });
  }
});
