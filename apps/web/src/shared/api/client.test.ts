import { expect, mock, test } from "bun:test";

import { ApiResponseError, Client, type Fetcher } from "./client";

type ExpectedBody = { value: string };

function isExpectedBody(value: unknown): value is ExpectedBody {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as Partial<ExpectedBody>).value === "string";
}

test("returns valid JSON", async () => {
  const fetcher = mock<Fetcher>(async () =>
    Response.json({ value: "accepted" }),
  );
  const client = new Client(fetcher);

  const result = await client.requestJson("/resource", {
    isValid: isExpectedBody,
  });

  expect(result).toEqual({ value: "accepted" });
});

test("rejects a non-OK response", () => {
  const fetcher = mock<Fetcher>(async () => Response.json({}, { status: 401 }));
  const client = new Client(fetcher);

  expect(
    client.requestJson("/resource", { isValid: isExpectedBody }),
  ).rejects.toBeInstanceOf(ApiResponseError);
});

test("rejects malformed JSON", () => {
  const fetcher = mock<Fetcher>(async () => new Response("{"));
  const client = new Client(fetcher);

  expect(
    client.requestJson("/resource", { isValid: isExpectedBody }),
  ).rejects.toThrow();
});

test("rejects an invalid response body", () => {
  const fetcher = mock<Fetcher>(async () => Response.json({ value: 42 }));
  const client = new Client(fetcher);

  expect(
    client.requestJson("/resource", { isValid: isExpectedBody }),
  ).rejects.toThrow("Invalid response");
});
