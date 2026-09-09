import { Module } from "@nestjs/common";

import { AccessTokenGuard } from "./access-token.guard";
import { AccessTokenService } from "./access-token";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { BunPasswordHasher, PASSWORD_HASHER } from "./password";
import { PrismaIdentityRepository } from "./prisma-identity.repository";
import { IDENTITY_REPOSITORY } from "./repository";
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
    PrismaIdentityRepository,
    { provide: IDENTITY_REPOSITORY, useExisting: PrismaIdentityRepository },
    { provide: PASSWORD_HASHER, useFactory: () => new BunPasswordHasher() },
    {
      provide: AuthService,
      useFactory: (identities, passwords, tokens) =>
        new AuthService(identities, passwords, tokens),
      inject: [IDENTITY_REPOSITORY, PASSWORD_HASHER, AccessTokenService],
    },
  ],
  exports: [PASSWORD_HASHER],
})
export class AuthModule {}
