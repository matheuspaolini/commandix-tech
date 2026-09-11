import { Global, Module } from "@nestjs/common";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");

export class BunPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return Bun.password.hash(password, {
      algorithm: "argon2id",
      memoryCost: 65_536,
      timeCost: 2,
    });
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return Bun.password.verify(password, hash);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PASSWORD_HASHER,
      useFactory: () => new BunPasswordHasher(),
    },
  ],
  exports: [PASSWORD_HASHER],
})
export class PlatformSecurityModule {}
