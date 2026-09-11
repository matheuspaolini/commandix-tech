import type { Role } from "./identity";

abstract class Identifier {
  protected constructor(readonly value: string) {
    if (!value) throw new Error("Identifier must not be empty");
  }
}

export class TenantIdentifier extends Identifier {
  static from(value: string): TenantIdentifier {
    return new TenantIdentifier(value);
  }
}

export class UserIdentifier extends Identifier {
  static from(value: string): UserIdentifier {
    return new UserIdentifier(value);
  }
}

export class TenantEntity {
  private constructor(
    readonly id: TenantIdentifier,
    readonly slug: string,
  ) {}

  static create(input: { id: TenantIdentifier; slug: string }): TenantEntity {
    return new TenantEntity(input.id, input.slug);
  }

  static reconstitute(input: {
    id: TenantIdentifier;
    slug: string;
  }): TenantEntity {
    return new TenantEntity(input.id, input.slug);
  }

  snapshot(): { id: string; slug: string } {
    return { id: this.id.value, slug: this.slug };
  }
}

export class UserEntity {
  private constructor(
    readonly id: UserIdentifier,
    readonly tenantId: TenantIdentifier,
    readonly email: string,
    readonly role: Role,
  ) {}

  static createAdmin(input: {
    id: UserIdentifier;
    tenantId: TenantIdentifier;
    email: string;
  }): UserEntity {
    return new UserEntity(input.id, input.tenantId, input.email, "ADMIN");
  }

  static reconstitute(input: {
    id: UserIdentifier;
    tenantId: TenantIdentifier;
    email: string;
    role: Role;
  }): UserEntity {
    return new UserEntity(input.id, input.tenantId, input.email, input.role);
  }

  snapshot(): { id: string; tenantId: string; email: string; role: Role } {
    return {
      id: this.id.value,
      tenantId: this.tenantId.value,
      email: this.email,
      role: this.role,
    };
  }
}
