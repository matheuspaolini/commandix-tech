import { Prisma } from "@commandix/database";
import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database";
import type { CreatedIdentity } from "../auth/repository";
import type { IdentityInput } from "./identity";

export class DuplicateOnboardingIdentity extends Error {}

export interface OnboardingRepository {
  createTenantAndAdmin(
    input: Pick<IdentityInput, "slug" | "email">,
    passwordHash: string,
  ): Promise<CreatedIdentity>;
}

export const ONBOARDING_REPOSITORY = Symbol("ONBOARDING_REPOSITORY");

@Injectable()
export class PrismaOnboardingRepository implements OnboardingRepository {
  constructor(private readonly database: DatabaseService) {}

  async createTenantAndAdmin(
    input: Pick<IdentityInput, "slug" | "email">,
    passwordHash: string,
  ): Promise<CreatedIdentity> {
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const tenant = await this.createTenant(transaction, input.slug);
        const user = await this.createAdmin(transaction, {
          tenantId: tenant.id,
          email: input.email,
          passwordHash,
        });
        return {
          userId: user.id,
          tenantId: tenant.id,
          email: user.email,
          role: user.role,
          slug: tenant.slug,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new DuplicateOnboardingIdentity();
      }
      throw error;
    }
  }

  protected async createTenant(
    transaction: Prisma.TransactionClient,
    slug: string,
  ) {
    return transaction.tenant.create({ data: { slug } });
  }

  protected async createAdmin(
    transaction: Prisma.TransactionClient,
    data: { tenantId: string; email: string; passwordHash: string },
  ) {
    return transaction.user.create({ data: { ...data, role: "ADMIN" } });
  }
}
