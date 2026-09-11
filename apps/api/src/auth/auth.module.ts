import { Module } from "@nestjs/common";

import { AccessTokenGuard } from "@/auth/presentation/access-token.guard";
import { AccessTokenService } from "@/auth/domain/access-token";
import { AuthController } from "@/auth/presentation/auth.controller";
import { AuthService } from "@/auth/application/sign-in/auth.service";
import { AuthLifecycleLogger } from "@/auth/infrastructure/auth-lifecycle-logger";
import { BrowserOriginGuard } from "@/auth/presentation/browser-auth.http";
import { BunPasswordHasher, PASSWORD_HASHER } from "@/platform/password-hasher";
import { PrismaIdentityRepository } from "@/auth/infrastructure/prisma-identity.repository";
import { IDENTITY_REPOSITORY } from "@/auth/application/sign-in/repository";
import { PrismaRefreshSessionRepository } from "@/auth/infrastructure/prisma-refresh-session.repository";
import { REFRESH_SESSION_REPOSITORY } from "@/auth/application/refresh-session/refresh-session.repository";
import { RefreshSessionService } from "@/auth/application/refresh-session/refresh-session.service";
import { AUTH_LIFECYCLE_WRITER } from "@/auth/application/refresh-session/auth-lifecycle-writer";
import { RuntimeConfig } from "@/runtime-config";

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AccessTokenService,
      useFactory: (config: RuntimeConfig) =>
        new AccessTokenService(config.jwtSecret),
      inject: [RuntimeConfig],
    },
    AccessTokenGuard,
    BrowserOriginGuard,
    AuthLifecycleLogger,
    { provide: AUTH_LIFECYCLE_WRITER, useExisting: AuthLifecycleLogger },
    PrismaIdentityRepository,
    PrismaRefreshSessionRepository,
    { provide: IDENTITY_REPOSITORY, useExisting: PrismaIdentityRepository },
    { provide: PASSWORD_HASHER, useFactory: () => new BunPasswordHasher() },
    {
      provide: REFRESH_SESSION_REPOSITORY,
      useExisting: PrismaRefreshSessionRepository,
    },
    {
      provide: RefreshSessionService,
      useFactory: (sessions, accessTokens, logger) =>
        new RefreshSessionService(sessions, accessTokens, logger),
      inject: [
        REFRESH_SESSION_REPOSITORY,
        AccessTokenService,
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
  exports: [AccessTokenGuard, AccessTokenService, PASSWORD_HASHER],
})
export class AuthModule {}
