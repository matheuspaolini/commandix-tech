import { describe, expect, test } from "bun:test";

import {
  AccessTokenService,
  type AccessTokenClaims,
  type AccessTokenSubject,
} from "../src/auth/domain/access-token";
import {
  BunPasswordHasher,
  type PasswordHasher,
} from "../src/platform/password-hasher";
import type { CreatedIdentity } from "../src/auth/application/sign-in/repository";
import {
  canonicalIdentity,
  type IdentityInput,
  InvalidIdentityInput,
} from "../src/tenant/domain/identity";
import type { OnboardingRepository } from "../src/tenant/application/onboarding/onboarding.repository";
import { OnboardingService } from "../src/tenant/application/onboarding/onboarding.service";

const JWT_SECRET = "local_development_jwt_secret_with_32_chars";
const ISSUED_AT = 1_700_000_000;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const PASSWORD = "correct horse battery staple";

const CANONICAL_IDENTITY = {
  slug: "acme",
  email: "admin@example.com",
  password: PASSWORD,
} satisfies IdentityInput;

const ACCESS_TOKEN_SUBJECT = {
  userId: "a9476bc1-c8d3-4ff7-9c7d-7e89ab3b3ec4",
  tenantId: "d6c3dcf5-53f4-40d9-bf8f-9fb57f29d6a9",
  role: "ADMIN",
} satisfies AccessTokenSubject;

const EXPECTED_ACCESS_TOKEN_CLAIMS = {
  sub: ACCESS_TOKEN_SUBJECT.userId,
  tenantId: ACCESS_TOKEN_SUBJECT.tenantId,
  role: ACCESS_TOKEN_SUBJECT.role,
  iat: ISSUED_AT,
  exp: ISSUED_AT + ACCESS_TOKEN_TTL_SECONDS,
} satisfies AccessTokenClaims;

const invalidIdentityCases = [
  ["consecutive slug separators", { slug: "acme--north" }],
  ["a short slug", { slug: "ab" }],
  ["an invalid email", { email: "not-an-email" }],
  ["a blank password", { password: "            " }],
] satisfies ReadonlyArray<readonly [string, Partial<IdentityInput>]>;

const malformedTokenCases = [
  ["an empty token", ""],
  ["one segment", "header"],
  ["two segments", "header.payload"],
  ["four segments", "header.payload.signature.extra"],
  ["an empty payload", "header..signature"],
  ["an invalid alphabet", "header.payload.!invalid!"],
] as const;

function identityInput(overrides: Partial<IdentityInput> = {}): IdentityInput {
  return { ...CANONICAL_IDENTITY, ...overrides };
}

function createTokenService(nowInSeconds = ISSUED_AT) {
  return new AccessTokenService(JWT_SECRET, {
    nowInSeconds: () => nowInSeconds,
  });
}

function issueAccessToken() {
  return createTokenService().issue(ACCESS_TOKEN_SUBJECT);
}

class RecordingOnboardingRepository implements OnboardingRepository {
  persisted: { slug: string; email: string; passwordHash: string } | undefined;

  async createTenantAndAdmin(
    input: Pick<IdentityInput, "slug" | "email">,
    passwordHash: string,
  ): Promise<CreatedIdentity> {
    this.persisted = { ...input, passwordHash };

    return {
      userId: "user-id",
      tenantId: "tenant-id",
      email: input.email,
      role: "ADMIN",
      slug: input.slug,
    };
  }
}

class StubPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return `hash:${password}`;
  }

  async verify(): Promise<boolean> {
    return false;
  }
}

function createOnboardingScenario() {
  const repository = new RecordingOnboardingRepository();
  const passwordHasher = new StubPasswordHasher();
  const service = new OnboardingService(repository, passwordHasher);

  return { repository, service };
}

describe("canonicalIdentity", () => {
  test("normalizes the slug and email while preserving the password", () => {
    const input = identityInput({
      slug: " Acme-North ",
      email: " ADMIN@Example.COM ",
      password: "  password with spaces  ",
    });

    expect(canonicalIdentity(input)).toStrictEqual({
      slug: "acme-north",
      email: "admin@example.com",
      password: "  password with spaces  ",
    });
  });

  for (const [scenario, overrides] of invalidIdentityCases) {
    test(`rejects ${scenario}`, () => {
      const input = identityInput(overrides);
      expect(() => canonicalIdentity(input)).toThrow(InvalidIdentityInput);
    });
  }
});

describe("BunPasswordHasher", () => {
  test("does not retain the plaintext password", async () => {
    const hash = await new BunPasswordHasher().hash(PASSWORD);
    expect(hash).not.toBe(PASSWORD);
  });

  test("verifies the correct password", async () => {
    const hasher = new BunPasswordHasher();
    const hash = await hasher.hash(PASSWORD);
    expect(await hasher.verify(PASSWORD, hash)).toBe(true);
  });

  test("rejects an incorrect password", async () => {
    const hasher = new BunPasswordHasher();
    const hash = await hasher.hash(PASSWORD);
    expect(await hasher.verify("wrong password", hash)).toBe(false);
  });
});

describe("AccessTokenService", () => {
  test("issues a JWT with three segments", () => {
    const segments = issueAccessToken().split(".");
    expect(segments).toHaveLength(3);
  });

  test("verifies an issued token", () => {
    const tokenService = createTokenService();
    const token = tokenService.issue(ACCESS_TOKEN_SUBJECT);
    expect(tokenService.verify(token)).toStrictEqual(
      EXPECTED_ACCESS_TOKEN_CLAIMS,
    );
  });

  test("rejects a tampered signature", () => {
    const tokenService = createTokenService();
    const tamperedToken = `${tokenService.issue(ACCESS_TOKEN_SUBJECT)}x`;
    expect(tokenService.verify(tamperedToken)).toBeNull();
  });

  test("rejects a token at its exact expiry boundary", () => {
    const token = issueAccessToken();
    const tokenService = createTokenService(
      ISSUED_AT + ACCESS_TOKEN_TTL_SECONDS,
    );
    expect(tokenService.verify(token)).toBeNull();
  });

  for (const [scenario, token] of malformedTokenCases) {
    test(`rejects ${scenario}`, () => {
      expect(createTokenService().verify(token)).toBeNull();
    });
  }
});

describe("OnboardingService", () => {
  test("returns the created tenant and Admin", async () => {
    const { service } = createOnboardingScenario();
    const result = await service.execute(
      identityInput({ slug: " Acme ", email: " ADMIN@example.com " }),
    );

    expect(result).toStrictEqual({
      tenant: { id: "tenant-id", slug: "acme" },
      user: { id: "user-id", email: "admin@example.com", role: "ADMIN" },
    });
  });

  test("persists canonical identity and a hashed password", async () => {
    const { repository, service } = createOnboardingScenario();
    await service.execute(
      identityInput({ slug: " Acme ", email: " ADMIN@example.com " }),
    );

    expect(repository.persisted).toStrictEqual({
      slug: "acme",
      email: "admin@example.com",
      passwordHash: `hash:${PASSWORD}`,
    });
  });
});
