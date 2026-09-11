export class RefreshSession {
  private constructor(
    readonly id: string,
    readonly expiresAt: Date,
    readonly revokedAt?: Date,
  ) {}

  static reconstitute(input: {
    id: string;
    expiresAt: Date;
    revokedAt?: Date;
  }): RefreshSession {
    return new RefreshSession(input.id, input.expiresAt, input.revokedAt);
  }

  revokeOnReuse(now: Date): { id: string; revokedAt: Date } {
    if (this.revokedAt) return { id: this.id, revokedAt: this.revokedAt };
    return { id: this.id, revokedAt: now };
  }
}
