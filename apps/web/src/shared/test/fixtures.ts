import type { Fetcher } from "@/shared/api";
import { API_ENDPOINTS } from "@/shared/api";
import { spyOn } from "bun:test";

export const SIGN_IN_FORM = {
  slug: "acme",
  email: "admin@example.com",
  password: "correct horse battery staple",
} as const;

export const ACCESS_TOKEN = "memory-only-token";

export type RequestRecord = { url: string; authorization?: string };

export function createIdentityFixture() {
  return {
    user: { id: "user", email: SIGN_IN_FORM.email },
    tenant: { id: "tenant", slug: SIGN_IN_FORM.slug },
    role: "ADMIN",
  } as const;
}

export function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

export function fetchImplementation(
  implementation: Fetcher,
): typeof globalThis.fetch {
  return Object.assign(implementation, {
    preconnect: globalThis.fetch.preconnect,
  });
}

export function mockSuccessfulSignIn(requests?: RequestRecord[]) {
  return spyOn(globalThis, "fetch").mockImplementation(
    fetchImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      requests?.push({
        url,
        authorization:
          new Headers(init?.headers).get("Authorization") ?? undefined,
      });

      return url === API_ENDPOINTS.signIn
        ? jsonResponse({ accessToken: ACCESS_TOKEN })
        : jsonResponse(createIdentityFixture());
    }),
  );
}
