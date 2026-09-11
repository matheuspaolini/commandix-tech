import { Module } from "@nestjs/common";

import { AccessTokenGuard } from "@/modules/auth/presentation/access-token.guard";
import { AccessTokenService } from "@/modules/auth/domain/access-token";
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
  exports: [AccessTokenGuard, AccessTokenService],
})
export class AuthModule {}
