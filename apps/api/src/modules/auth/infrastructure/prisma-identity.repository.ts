import { Injectable } from "@nestjs/common";

import { DatabaseService } from "@/platform/database";
import type {
  CreatedIdentity,
  IdentityRepository,
  StoredIdentity,
} from "@/modules/auth/application/sign-in/repository";

@Injectable()
export class PrismaIdentityRepository implements IdentityRepository {
  constructor(private readonly database: DatabaseService) {}

  async findForSignIn(
    slug: string,
    email: string,
  ): Promise<StoredIdentity | null> {
    const tenant = await this.database.client.tenant.findUnique({
      where: { slug },
      include: { users: { where: { email }, take: 1 } },
    });
    const user = tenant?.users[0];
    if (!tenant || !user) return null;
    return {
      userId: user.id,
      tenantId: tenant.id,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      slug: tenant.slug,
    };
  }

  async findVerifiedIdentity(
    userId: string,
    tenantId: string,
  ): Promise<CreatedIdentity | null> {
    const user = await this.database.client.user.findFirst({
      where: { id: userId, tenantId },
      include: { tenant: true },
    });
    if (!user) return null;
    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      slug: user.tenant.slug,
    };
  }
}
