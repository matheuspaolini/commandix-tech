import type { AccessTokenSubject, Clock } from "@/auth/domain/access-token";
import { AccessTokenService } from "@/auth/domain/access-token";
import { AuthenticationFailed } from "@/auth/domain/errors";
import {
  createRefreshCredential,
  parseRefreshCredential,
} from "@/auth/domain/refresh-credential";
import type { RefreshSessionRepository } from "./refresh-session.repository";
import type { AuthLifecycleWriter } from "./auth-lifecycle-writer";

const REFRESH_SESSION_SECONDS = 7 * 24 * 60 * 60;

const SYSTEM_CLOCK: Clock = {
  nowInSeconds: () => Math.floor(Date.now() / 1_000),
};

export type IssuedSession = {
  accessToken: string;
  refreshCredential: string;
  expiresAt: Date;
};

export class RefreshSessionService {
  constructor(
    private readonly sessions: RefreshSessionRepository,
    private readonly accessTokens: AccessTokenService,
    private readonly logger: AuthLifecycleWriter,
    private readonly clock: Clock = SYSTEM_CLOCK,
  ) {}

  async create(subject: AccessTokenSubject): Promise<IssuedSession> {
    const now = this.now();
    const expiresAt = new Date(
      (this.clock.nowInSeconds() + REFRESH_SESSION_SECONDS) * 1_000,
    );
    const credential = createRefreshCredential();
    const created = await this.sessions.create({
      userId: subject.userId,
      createdAt: now,
      expiresAt,
      credential: {
        selector: credential.selector,
        secretHash: credential.secretHash,
      },
    });
    this.logger.sessionCreated(created.sessionId, subject.userId);

    return {
      accessToken: this.accessTokens.issue(subject),
      refreshCredential: credential.serialized,
      expiresAt,
    };
  }

  async rotate(value: string | undefined): Promise<IssuedSession> {
    const presented = parseRefreshCredential(value);
    if (!presented) throw new AuthenticationFailed();

    const replacement = createRefreshCredential();
    const result = await this.sessions.rotate({
      presented,
      replacement: {
        selector: replacement.selector,
        secretHash: replacement.secretHash,
      },
      now: this.now(),
    });
    if (result.outcome === "invalid") throw new AuthenticationFailed();
    if (result.outcome === "reused") {
      this.logger.reuseDetected(result.sessionId);
      throw new AuthenticationFailed();
    }

    this.logger.credentialRotated(result.sessionId);
    return {
      accessToken: this.accessTokens.issue(result.subject),
      refreshCredential: replacement.serialized,
      expiresAt: result.expiresAt,
    };
  }

  async revoke(value: string | undefined): Promise<void> {
    const presented = parseRefreshCredential(value);
    if (!presented) return;

    const result = await this.sessions.revoke({
      presented,
      now: this.now(),
    });
    if (!result) return;

    if (result.revokedNow) this.logger.sessionRevoked(result.sessionId);
    this.logger.signedOut(result.sessionId);
  }

  private now(): Date {
    return new Date(this.clock.nowInSeconds() * 1_000);
  }
}
