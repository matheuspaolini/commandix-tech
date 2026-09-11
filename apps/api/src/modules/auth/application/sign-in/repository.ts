import type { AuthenticatedRole } from "@/modules/auth/domain/authenticated-identity";

export type StoredIdentity = {
  userId: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: AuthenticatedRole;
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
