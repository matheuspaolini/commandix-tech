import type { AuthenticatedIdentity } from "@/modules/auth/domain/authenticated-identity";
import type { PresentedRefreshCredential } from "@/modules/auth/application/token-codecs";

export type NewStoredRefreshCredential = PresentedRefreshCredential;

export type CreateRefreshSession = {
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  credential: NewStoredRefreshCredential;
};

export type CreatedRefreshSession = {
  sessionId: string;
};

export type RotateRefreshSession = {
  presented: PresentedRefreshCredential;
  replacement: NewStoredRefreshCredential;
  now: Date;
};

export type RotationResult =
  | {
      outcome: "rotated";
      subject: AuthenticatedIdentity;
      expiresAt: Date;
      sessionId: string;
    }
  | { outcome: "invalid" }
  | { outcome: "reused"; sessionId: string };

export type RevokeRefreshSession = {
  presented: PresentedRefreshCredential;
  now: Date;
};

export type RevocationResult = {
  sessionId: string;
  revokedNow: boolean;
};

export interface RefreshSessionRepository {
  create(input: CreateRefreshSession): Promise<CreatedRefreshSession>;
  rotate(input: RotateRefreshSession): Promise<RotationResult>;
  revoke(input: RevokeRefreshSession): Promise<RevocationResult | null>;
}

export const REFRESH_SESSION_REPOSITORY = Symbol("REFRESH_SESSION_REPOSITORY");
