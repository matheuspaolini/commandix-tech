import { Module } from "@nestjs/common";

import { AccessTokenGuard } from "@/modules/auth/presentation/access-token.guard";
import { BunAccessTokenCodec } from "@/modules/auth/infrastructure/bun-access-token-codec";
import { BunRefreshCredentialCodec } from "@/modules/auth/infrastructure/bun-refresh-credential-codec";
import {
  ACCESS_TOKEN_CODEC,
  REFRESH_CREDENTIAL_CODEC,
} from "@/modules/auth/application/token-codecs";
import { AuthController } from "@/modules/auth/presentation/auth.controller";
import { AuthService } from "@/modules/auth/application/sign-in/auth.service";
import { AuthLifecycleLogger } from "@/modules/auth/infrastructure/auth-lifecycle-logger";
import { BrowserOriginGuard } from "@/modules/auth/presentation/browser-auth.http";
import { PASSWORD_HASHER } from "@/platform/password-hasher";
import { PrismaIdentityRepository } from "@/modules/auth/infrastructure/prisma-identity.repository";
import { IDENTITY_REPOSITORY } from "@/modules/auth/application/sign-in/repository";
import { PrismaRefreshSessionRepository } from "@/modules/auth/infrastructure/prisma-refresh-session.repository";
import { REFRESH_SESSION_REPOSITORY } from "@/modules/auth/application/refresh-session/refresh-session.repository";
import { RefreshSessionService } from "@/modules/auth/application/refresh-session/refresh-session.service";
import { AUTH_LIFECYCLE_WRITER } from "@/modules/auth/application/refresh-session/auth-lifecycle-writer";
import { RuntimeConfig } from "@/platform/runtime-config";

const AUTH_CLOCK = {
  nowInSeconds: () => Math.floor(Date.now() / 1_000),
};

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: BunAccessTokenCodec,
      useFactory: (config: RuntimeConfig) =>
        new BunAccessTokenCodec(config.jwtSecret, AUTH_CLOCK),
      inject: [RuntimeConfig],
    },
    { provide: ACCESS_TOKEN_CODEC, useExisting: BunAccessTokenCodec },
    {
      provide: REFRESH_CREDENTIAL_CODEC,
      useFactory: () => new BunRefreshCredentialCodec(),
    },
    AccessTokenGuard,
    BrowserOriginGuard,
    AuthLifecycleLogger,
    { provide: AUTH_LIFECYCLE_WRITER, useExisting: AuthLifecycleLogger },
    PrismaIdentityRepository,
    PrismaRefreshSessionRepository,
    { provide: IDENTITY_REPOSITORY, useExisting: PrismaIdentityRepository },
    {
      provide: REFRESH_SESSION_REPOSITORY,
      useExisting: PrismaRefreshSessionRepository,
    },
    {
      provide: RefreshSessionService,
      useFactory: (sessions, accessTokens, refreshCredentials, logger) =>
        new RefreshSessionService(
          sessions,
          accessTokens,
          refreshCredentials,
          logger,
          AUTH_CLOCK,
        ),
      inject: [
        REFRESH_SESSION_REPOSITORY,
        ACCESS_TOKEN_CODEC,
        REFRESH_CREDENTIAL_CODEC,
        AUTH_LIFECYCLE_WRITER,
      ],
    },
    {
      provide: AuthService,
      useFactory: (identities, passwords, refreshSessions) =>
        new AuthService(identities, passwords, refreshSessions),
      inject: [IDENTITY_REPOSITORY, PASSWORD_HASHER, RefreshSessionService],
    },
  ],
  exports: [AccessTokenGuard, ACCESS_TOKEN_CODEC],
})
export class AuthModule {}
