import { canonicalIdentity, type IdentityInput } from "../tenant/tenant.contract";
import type { AccessTokenClaims } from "./access-token";
import { AuthenticationFailed } from "./errors";
import type { PasswordHasher } from "../platform/password-hasher";
import type { IdentityRepository } from "./repository";
import { RefreshSessionService } from "./refresh-session.service";

export class AuthService {
  constructor(
    private readonly identities: IdentityRepository,
    private readonly passwords: PasswordHasher,
    private readonly refreshSessions: RefreshSessionService,
  ) {}

  async signIn(input: IdentityInput) {
    const identity = canonicalIdentity(input);
    const stored = await this.identities.findForSignIn(
      identity.slug,
      identity.email,
    );
    if (
      !stored ||
      !(await this.passwords.verify(identity.password, stored.passwordHash))
    ) {
      throw new AuthenticationFailed();
    }
    return this.refreshSessions.create(stored);
  }

  async identity(claims: AccessTokenClaims) {
    const identity = await this.identities.findVerifiedIdentity(
      claims.sub,
      claims.tenantId,
    );
    if (!identity || identity.role !== claims.role) {
      throw new AuthenticationFailed();
    }
    return {
      user: { id: identity.userId, email: identity.email },
      tenant: { id: identity.tenantId, slug: identity.slug },
      role: identity.role,
    };
  }
}
