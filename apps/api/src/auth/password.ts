export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");

export class BunPasswordHasher {
  hash(password: string) {
    return Bun.password.hash(password, {
      algorithm: "argon2id",
      memoryCost: 65_536,
      timeCost: 2,
    });
  }

  verify(password: string, hash: string) {
    return Bun.password.verify(password, hash);
  }
}
