export interface AuthLifecycleWriter {
  sessionCreated(sessionId: string, userId: string): void;
  credentialRotated(sessionId: string): void;
  reuseDetected(sessionId: string): void;
  sessionRevoked(sessionId: string): void;
  signedOut(sessionId: string): void;
}

export const AUTH_LIFECYCLE_WRITER = Symbol("AUTH_LIFECYCLE_WRITER");
