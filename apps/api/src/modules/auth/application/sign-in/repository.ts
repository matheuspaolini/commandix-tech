import type { Role } from "@/modules/tenant/tenant.contract";

export type StoredIdentity = {
  userId: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: Role;
  slug: string;
};

export type CreatedIdentity = Omit<StoredIdentity, "passwordHash">;

export interface IdentityRepository {
  findForSignIn(slug: string, email: string): Promise<StoredIdentity | null>;
  findVerifiedIdentity(
    userId: string,
    tenantId: string,
  ): Promise<CreatedIdentity | null>;
}

export const IDENTITY_REPOSITORY = Symbol("IDENTITY_REPOSITORY");
