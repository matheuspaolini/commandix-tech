import type { AuthenticatedIdentity } from "@/modules/auth/domain/authenticated-identity";

export type IssuedRefreshCredential = {
  serialized: string;
  selector: string;
  secretHash: string;
};

export type PresentedRefreshCredential = {
  selector: string;
  secretHash: string;
};

export interface AccessTokenCodec {
  issue(subject: AuthenticatedIdentity): string;
  verify(serialized: string): AuthenticatedIdentity | null;
}

export interface RefreshCredentialCodec {
  issue(): IssuedRefreshCredential;
  parse(serialized: string | undefined): PresentedRefreshCredential | null;
}

export const ACCESS_TOKEN_CODEC = Symbol("ACCESS_TOKEN_CODEC");
export const REFRESH_CREDENTIAL_CODEC = Symbol("REFRESH_CREDENTIAL_CODEC");
