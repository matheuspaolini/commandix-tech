import { canonicalIdentity, type IdentityInput } from "../tenant/identity";
import { AccessTokenService, type AccessTokenClaims } from "./access-token";
import type { PasswordHasher } from "./password";
import type { IdentityRepository } from "./repository";

export class AuthenticationFailed extends Error {}

export class AuthService {
  constructor(
    private readonly identities: IdentityRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: AccessTokenService,
  ) {}

  async login(input: IdentityInput) {
    const identity = canonicalIdentity(input);
    const stored = await this.identities.findForLogin(
      identity.slug,
      identity.email,
    );
    if (
      !stored ||
      !(await this.passwords.verify(identity.password, stored.passwordHash))
    ) {
      throw new AuthenticationFailed();
    }
    return { accessToken: this.tokens.issue(stored) };
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
