import type { PasswordHasher } from "../platform/password-hasher";
import { canonicalIdentity, type Role } from "../tenant/identity";
import type { TemplateDefinition } from "./template-definition";

export type SeedUser = { email: string; role: Role };
export type SeedWorkspace = {
  slug: string;
  users: readonly SeedUser[];
  template: TemplateDefinition;
};

export type SeedCounts = {
  tenantsCreated: number;
  usersCreated: number;
  templatesCreated: number;
};

export interface SeedWorkspaceRepository {
  ensureTenant(slug: string): Promise<{ id: string; created: boolean }>;
  hasUser(tenantId: string, email: string): Promise<boolean>;
  createUser(input: {
    tenantId: string;
    email: string;
    passwordHash: string;
    role: Role;
  }): Promise<boolean>;
  ensureTemplate(
    tenantId: string,
    definition: TemplateDefinition,
  ): Promise<boolean>;
}

export class SeedWorkspaces {
  constructor(
    private readonly repository: SeedWorkspaceRepository,
    private readonly passwords: PasswordHasher,
  ) {}

  async execute(
    workspaces: readonly SeedWorkspace[],
    password: string,
  ): Promise<SeedCounts> {
    const counts: SeedCounts = {
      tenantsCreated: 0,
      usersCreated: 0,
      templatesCreated: 0,
    };

    for (const workspace of workspaces) {
      const canonicalWorkspace = canonicalIdentity({
        slug: workspace.slug,
        email: workspace.users[0]?.email ?? "",
        password,
      });
      const tenant = await this.repository.ensureTenant(
        canonicalWorkspace.slug,
      );
      if (tenant.created) counts.tenantsCreated += 1;

      for (const user of workspace.users) {
        const identity = canonicalIdentity({
          slug: workspace.slug,
          email: user.email,
          password,
        });
        const exists = await this.repository.hasUser(tenant.id, identity.email);
        if (exists) continue;
        const passwordHash = await this.passwords.hash(identity.password);
        const created = await this.repository.createUser({
          tenantId: tenant.id,
          email: identity.email,
          passwordHash,
          role: user.role,
        });
        if (created) counts.usersCreated += 1;
      }

      const templateCreated = await this.repository.ensureTemplate(
        tenant.id,
        workspace.template,
      );
      if (templateCreated) counts.templatesCreated += 1;
    }

    return counts;
  }
}
