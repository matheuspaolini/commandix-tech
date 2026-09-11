const BASE64_URL = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFRESH_SECRET_BYTES = 32;
import type {
  IssuedRefreshCredential,
  PresentedRefreshCredential,
  RefreshCredentialCodec,
} from "@/modules/auth/application/token-codecs";

export type NewRefreshCredential = IssuedRefreshCredential;

export function createRefreshCredential(): NewRefreshCredential {
  const selector = crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(REFRESH_SECRET_BYTES));
  const secret = bytes.toBase64({
    alphabet: "base64url",
    omitPadding: true,
  });

  return {
    selector,
    secretHash: hashRefreshSecret(secret),
    serialized: `${selector}.${secret}`,
  };
}

export function parseRefreshCredential(
  value: string | undefined,
): PresentedRefreshCredential | null {
  if (!value) return null;

  const [selector, secret, extra] = value.split(".");
  if (!selector || !secret || extra !== undefined) return null;
  if (!UUID.test(selector) || !BASE64_URL.test(secret)) return null;

  return { selector, secretHash: hashRefreshSecret(secret) };
}

export class BunRefreshCredentialCodec implements RefreshCredentialCodec {
  issue(): IssuedRefreshCredential {
    return createRefreshCredential();
  }

  parse(value: string | undefined): PresentedRefreshCredential | null {
    return parseRefreshCredential(value);
  }
}

function hashRefreshSecret(secret: string): string {
  return new Bun.CryptoHasher("sha256").update(secret).digest("base64url");
}
