import { describe, expect, test } from "bun:test";

import { BunAccessTokenCodec } from "@/modules/auth/infrastructure/bun-access-token-codec";
import { AuthLifecycleLogger } from "@/modules/auth/infrastructure/auth-lifecycle-logger";
import {
  BunRefreshCredentialCodec,
  createRefreshCredential,
  parseRefreshCredential,
} from "@/modules/auth/infrastructure/bun-refresh-credential-codec";
import type {
  CreateRefreshSession,
  CreatedRefreshSession,
  RefreshSessionRepository,
  RevokeRefreshSession,
  RevocationResult,
  RotateRefreshSession,
  RotationResult,
} from "@/modules/auth/application/refresh-session/refresh-session.repository";
import { RefreshSessionService } from "@/modules/auth/application/refresh-session/refresh-session.service";

const NOW = 1_700_000_000;
const JWT_SECRET = "local_development_jwt_secret_with_32_chars";
const KNOWN_REFRESH_CREDENTIAL =
  "a9476bc1-c8d3-4ff7-9c7d-7e89ab3b3ec4.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const SUBJECT = {
  userId: "a9476bc1-c8d3-4ff7-9c7d-7e89ab3b3ec4",
  tenantId: "d6c3dcf5-53f4-40d9-bf8f-9fb57f29d6a9",
  role: "ADMIN",
} as const;

class RecordingRepository implements RefreshSessionRepository {
  created?: CreateRefreshSession;

  async create(input: CreateRefreshSession): Promise<CreatedRefreshSession> {
    this.created = input;
    return { sessionId: "session-id" };
  }

  async rotate(_input: RotateRefreshSession): Promise<RotationResult> {
    return { outcome: "invalid" };
  }

  async revoke(_input: RevokeRefreshSession): Promise<RevocationResult | null> {
    return null;
  }
}

describe("Refresh credential", () => {
  test("round-trips a generated credential without exposing its secret", () => {
    const credential = createRefreshCredential();
    const parsed = parseRefreshCredential(credential.serialized);

    expect(parsed).toEqual({
      selector: credential.selector,
      secretHash: credential.secretHash,
    });
  });

  test("rejects malformed credentials", () => {
    expect(parseRefreshCredential("not-a-credential")).toBeNull();
  });

  test("preserves refresh credential parsing and hashing", () => {
    expect(parseRefreshCredential(KNOWN_REFRESH_CREDENTIAL)).toStrictEqual({
      selector: "a9476bc1-c8d3-4ff7-9c7d-7e89ab3b3ec4",
      secretHash: "DwBzhbb51LfusnSGBa_hqYSgo7-j8BTQnip4TOnlzRo",
    });
  });
});

describe("RefreshSessionService", () => {
  test("creates a fixed seven-day Refresh session", async () => {
    const repository = new RecordingRepository();
    const service = new RefreshSessionService(
      repository,
      new BunAccessTokenCodec(JWT_SECRET, { nowInSeconds: () => NOW }),
      new BunRefreshCredentialCodec(),
      new AuthLifecycleLogger(),
      { nowInSeconds: () => NOW },
    );

    const issued = await service.create(SUBJECT);

    expect({
      createdAt: repository.created?.createdAt.toISOString(),
      expiresAt: issued.expiresAt.toISOString(),
      storedCredential: repository.created?.credential,
      serializedStored: JSON.stringify(repository.created).includes(
        issued.refreshCredential,
      ),
    }).toEqual({
      createdAt: "2023-11-14T22:13:20.000Z",
      expiresAt: "2023-11-21T22:13:20.000Z",
      storedCredential: {
        selector: expect.any(String),
        secretHash: expect.any(String),
      },
      serializedStored: false,
    });
  });
});
