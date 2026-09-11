import type { PasswordHasher } from "@/platform/password-hasher";
import {
  canonicalIdentity,
  type IdentityInput,
} from "@/modules/tenant/domain/identity";
import type { OnboardingRepository } from "./onboarding.repository";

export class OnboardingService {
  constructor(
    private readonly identities: OnboardingRepository,
    private readonly passwords: PasswordHasher,
  ) {}

  async execute(input: IdentityInput) {
    const identity = canonicalIdentity(input);
    const passwordHash = await this.passwords.hash(identity.password);
    const created = await this.identities.createTenantAndAdmin(
      { slug: identity.slug, email: identity.email },
      passwordHash,
    );
    return {
      tenant: { id: created.tenantId, slug: created.slug },
      user: { id: created.userId, email: created.email, role: created.role },
    };
  }
}
