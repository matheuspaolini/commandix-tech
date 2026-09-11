import type { Role } from "@/tenant/tenant.contract";

const BASE64_URL = /^[A-Za-z0-9_-]+$/;
const TTL_SECONDS = 15 * 60;
const JWT_HEADER = { alg: "HS256", typ: "JWT" } as const;

export interface Clock {
  nowInSeconds(): number;
}

const SYSTEM_CLOCK: Clock = {
  nowInSeconds: () => Math.floor(Date.now() / 1000),
};

export type AccessTokenClaims = {
  sub: string;
  tenantId: string;
  role: Role;
  iat: number;
  exp: number;
};

export type AccessTokenSubject = {
  userId: string;
  tenantId: string;
  role: Role;
};

type JwtParts = {
  header: string;
  payload: string;
  signature: string;
};

interface JwtSegmentCodec {
  encode(value: object): string;
  decode(segment: string): unknown | null;
}

interface JwtSigner {
  sign(signingInput: string): string;
  verify(signingInput: string, signature: string): boolean;
}

class BunBase64UrlJsonCodec implements JwtSegmentCodec {
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });

  encode(value: object): string {
    const json = JSON.stringify(value);
    const bytes = this.encoder.encode(json);

    return bytes.toBase64({ alphabet: "base64url", omitPadding: true });
  }

  decode(segment: string): unknown | null {
    if (!isBase64UrlSegment(segment)) return null;

    try {
      const bytes = Uint8Array.fromBase64(segment, {
        alphabet: "base64url",
        lastChunkHandling: "loose",
      });
      const canonicalSegment = bytes.toBase64({
        alphabet: "base64url",
        omitPadding: true,
      });

      if (canonicalSegment !== segment) return null;

      const json = this.decoder.decode(bytes);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
}

class BunHs256Signer implements JwtSigner {
  constructor(private readonly secret: string) {}

  sign(signingInput: string): string {
    const hasher = new Bun.CryptoHasher("sha256", this.secret);
    hasher.update(signingInput);

    return hasher.digest("base64url");
  }

  verify(signingInput: string, signature: string): boolean {
    const expectedSignature = this.sign(signingInput);
    return constantWorkEqual(expectedSignature, signature);
  }
}

function assertValidSecret(
  secret: string | undefined,
): asserts secret is string {
  if (!secret || secret.length < 32) {
    throw new Error("Missing JWT_SECRET");
  }
}

function isBase64UrlSegment(segment: string): boolean {
  return BASE64_URL.test(segment);
}

function parseJwtParts(token: string): JwtParts | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;

  const [header, payload, signature] = segments;
  if (!header || !payload || !signature) return null;

  const hasValidEncoding = [header, payload, signature].every(
    isBase64UrlSegment,
  );
  if (!hasValidEncoding) return null;

  return { header, payload, signature };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJwtHeader(value: unknown): boolean {
  return isRecord(value) && value.alg === "HS256" && value.typ === "JWT";
}

function createClaims(
  subject: AccessTokenSubject,
  issuedAt: number,
): AccessTokenClaims {
  return {
    sub: subject.userId,
    tenantId: subject.tenantId,
    role: subject.role,
    iat: issuedAt,
    exp: issuedAt + TTL_SECONDS,
  };
}

function toAccessTokenClaims(
  value: unknown,
  currentTime: number,
): AccessTokenClaims | null {
  if (!isRecord(value)) return null;

  const { sub, tenantId, role, iat, exp } = value;
  const hasValidIdentity =
    typeof sub === "string" &&
    typeof tenantId === "string" &&
    (role === "ADMIN" || role === "MEMBER");
  const hasNumericTimestamps =
    typeof iat === "number" && typeof exp === "number";

  if (!hasValidIdentity || !hasNumericTimestamps) return null;

  const hasValidTimestamps =
    Number.isSafeInteger(iat) &&
    Number.isSafeInteger(exp) &&
    exp > iat &&
    exp > currentTime;

  if (!hasValidTimestamps) return null;

  return { sub, tenantId, role, iat, exp };
}

function constantWorkEqual(expected: string, received: string): boolean {
  const comparisonLength = Math.max(expected.length, received.length);
  let difference = expected.length ^ received.length;

  for (let index = 0; index < comparisonLength; index += 1) {
    const expectedCode = expected.charCodeAt(index) || 0;
    const receivedCode = received.charCodeAt(index) || 0;
    difference |= expectedCode ^ receivedCode;
  }

  return difference === 0;
}

export class AccessTokenService {
  private readonly codec: JwtSegmentCodec;
  private readonly signer: JwtSigner;

  constructor(
    secret: string,
    private readonly clock: Clock = SYSTEM_CLOCK,
  ) {
    assertValidSecret(secret);
    this.codec = new BunBase64UrlJsonCodec();
    this.signer = new BunHs256Signer(secret);
  }

  issue(subject: AccessTokenSubject): string {
    const issuedAt = this.clock.nowInSeconds();
    const claims = createClaims(subject, issuedAt);
    const headerSegment = this.codec.encode(JWT_HEADER);
    const payloadSegment = this.codec.encode(claims);
    const signingInput = `${headerSegment}.${payloadSegment}`;
    const signature = this.signer.sign(signingInput);

    return `${signingInput}.${signature}`;
  }

  verify(token: string): AccessTokenClaims | null {
    const parts = parseJwtParts(token);
    if (!parts) return null;

    const signingInput = `${parts.header}.${parts.payload}`;
    const hasValidSignature = this.signer.verify(signingInput, parts.signature);
    if (!hasValidSignature) return null;

    const header = this.codec.decode(parts.header);
    if (!isJwtHeader(header)) return null;

    const payload = this.codec.decode(parts.payload);
    const currentTime = this.clock.nowInSeconds();

    return toAccessTokenClaims(payload, currentTime);
  }
}
