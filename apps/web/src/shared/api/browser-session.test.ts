import { expect, mock, test } from "bun:test";

import { BrowserSession } from "./browser-session";
import { Client, type Fetcher } from "./client";
import { API_ENDPOINTS } from "./endpoints";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

test("concurrent unauthorized requests share one refresh", async () => {
  let refreshCount = 0;
  let protectedCount = 0;
  const client = new Client(
    mock<Fetcher>(async (input) => {
      const url = input.toString();
      if (url === API_ENDPOINTS.signIn) {
        return json({ accessToken: "initial-token" });
      }
      if (url === API_ENDPOINTS.refresh) {
        refreshCount += 1;
        return json({ accessToken: "renewed-token" });
      }
      protectedCount += 1;
      return protectedCount <= 2 ? json({}, 401) : json({ value: "ok" });
    }),
  );
  const session = new BrowserSession(client);
  await session.signIn({
    slug: "acme",
    email: "admin@example.com",
    password: "correct horse battery staple",
  });
  const options = {
    isValid: (value: unknown): value is { value: string } =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { value?: unknown }).value === "string",
  };

  const values = await Promise.all([
    session.requestJson("/protected/one", options),
    session.requestJson("/protected/two", options),
  ]);

  expect({ refreshCount, values }).toEqual({
    refreshCount: 1,
    values: [{ value: "ok" }, { value: "ok" }],
  });
});

test("sign-out remains local when its request fails", async () => {
  let requests = 0;
  const session = new BrowserSession(
    new Client(
      mock<Fetcher>(async () => {
        requests += 1;
        throw new Error("network unavailable");
      }),
    ),
  );

  await session.signOut();

  expect(requests).toBe(1);
});
