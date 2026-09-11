import type { IdentityInput, Role } from "@/modules/tenant/domain/identity";

export type CreatedOnboardingIdentity = {
  userId: string;
  tenantId: string;
  email: string;
  role: Role;
  slug: string;
};

export class DuplicateOnboardingIdentity extends Error {}

export interface OnboardingRepository {
  createTenantAndAdmin(
    input: Pick<IdentityInput, "slug" | "email">,
    passwordHash: string,
  ): Promise<CreatedOnboardingIdentity>;
}

export const ONBOARDING_REPOSITORY = Symbol("ONBOARDING_REPOSITORY");
