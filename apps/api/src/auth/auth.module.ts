import { Module } from "@nestjs/common";

import { AccessTokenGuard } from "./access-token.guard";
import { AccessTokenService } from "./access-token";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthLifecycleLogger } from "./auth-lifecycle-logger";
import { BrowserOriginGuard } from "./browser-auth.http";
import { BunPasswordHasher, PASSWORD_HASHER } from "./password";
import { PrismaIdentityRepository } from "./prisma-identity.repository";
import { IDENTITY_REPOSITORY } from "./repository";
import { PrismaRefreshSessionRepository } from "./prisma-refresh-session.repository";
import { REFRESH_SESSION_REPOSITORY } from "./refresh-session.repository";
import { RefreshSessionService } from "./refresh-session.service";
import { RuntimeConfig } from "../runtime-config";

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
        AuthLifecycleLogger,
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
