import { Injectable } from "@nestjs/common";

import { requestContext } from "@/platform/http";

const AUTH_EVENTS = {
  sessionCreated: "auth_refresh_session_created",
  credentialRotated: "auth_refresh_credential_rotated",
  reuseDetected: "auth_refresh_reuse_detected",
  sessionRevoked: "auth_refresh_session_revoked",
  signedOut: "auth_signed_out",
} as const;

type AuthEvent = (typeof AUTH_EVENTS)[keyof typeof AUTH_EVENTS];

@Injectable()
export class AuthLifecycleLogger {
  write(event: AuthEvent, sessionId: string, userId?: string): void {
    console.log(
      JSON.stringify({
        event,
        correlationId: requestContext.correlationId(),
        sessionId,
        ...(userId ? { userId } : {}),
      }),
    );
  }

  sessionCreated(sessionId: string, userId: string): void {
    this.write(AUTH_EVENTS.sessionCreated, sessionId, userId);
  }

  credentialRotated(sessionId: string): void {
    this.write(AUTH_EVENTS.credentialRotated, sessionId);
  }

  reuseDetected(sessionId: string): void {
    this.write(AUTH_EVENTS.reuseDetected, sessionId);
  }

  sessionRevoked(sessionId: string): void {
    this.write(AUTH_EVENTS.sessionRevoked, sessionId);
  }

  signedOut(sessionId: string): void {
    this.write(AUTH_EVENTS.signedOut, sessionId);
  }
}
