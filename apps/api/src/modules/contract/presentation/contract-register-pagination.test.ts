import { describe, expect, test } from "bun:test";
import {
  decodeContractRegisterCursor,
  encodeContractRegisterCursor,
  InvalidContractPagination,
  parseContractRegisterQuery,
} from "./contract-register-pagination";

const boundary = {
  createdAt: new Date("2026-09-11T12:30:00.000Z"),
  id: "8c3272ba-5192-4d55-817d-13f041850945",
};

test("round-trips a canonical opaque register boundary", () => {
  const cursor = encodeContractRegisterCursor(boundary);
  expect(decodeContractRegisterCursor(cursor)).toEqual(boundary);
});

test("parses only documented Contract register parameters", () => {
  const cursor = encodeContractRegisterCursor(boundary);
  expect({
    defaults: parseContractRegisterQuery({}),
    maximum: parseContractRegisterQuery({ limit: "100", after: cursor }),
    invalid: ["", "0", "1.5", "101"].map((limit) => {
      try {
        parseContractRegisterQuery({ limit });
        return false;
      } catch (error) {
        return error instanceof InvalidContractPagination;
      }
    }),
  }).toEqual({
    defaults: { limit: 20, after: null },
    maximum: { limit: 100, after: boundary },
    invalid: [true, true, true, true],
  });
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
