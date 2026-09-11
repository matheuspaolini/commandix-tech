export type AuthenticatedRole = "ADMIN" | "MEMBER";

/** Auth-owned identity carried inward after a Tenant contract has been mapped. */
export type AuthenticatedIdentity = {
  userId: string;
  tenantId: string;
  role: AuthenticatedRole;
  iat?: number;
  exp?: number;
};
