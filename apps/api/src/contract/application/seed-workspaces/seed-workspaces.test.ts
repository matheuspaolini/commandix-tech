import { describe, expect, test } from "bun:test";

import {
  type CanonicalizeSeedIdentity,
  type SeedPasswordHasher,
  type SeedWorkspaceRepository,
  SeedWorkspaces,
} from "@/contract/application/seed-workspaces/seed-workspaces";
import { canonicalTemplateDefinition } from "@/contract/domain/template-definition";

const TEMPLATE = canonicalTemplateDefinition({
  fields: [{ key: "title", label: "Title", type: "text", required: true }],
});
const WORKSPACES = [
  {
    slug: "acme",
    users: [
      { email: "admin@acme.test", role: "ADMIN" as const },
      { email: "member@acme.test", role: "MEMBER" as const },
    ],
    template: TEMPLATE,
  },
];

class StubPasswordHasher implements SeedPasswordHasher {
  hashed: string[] = [];

  async hash(password: string): Promise<string> {
    this.hashed.push(password);
    return `hash:${password}`;
  }
}

const canonicalize: CanonicalizeSeedIdentity = ({ slug, email, password }) => ({
  slug: slug.trim().toLowerCase(),
  email: email.trim().toLowerCase(),
  password,
});

class RecordingSeedRepository implements SeedWorkspaceRepository {
  readonly users = new Set<string>();
  templateExists = false;

  async ensureTenant() {
    return { id: "tenant-id", created: true };
  }

  async hasUser(_tenantId: string, email: string) {
    return this.users.has(email);
  }

  async createUser(input: { email: string }) {
    this.users.add(input.email);
    return true;
  }

  async ensureTemplate() {
    if (this.templateExists) return false;
    this.templateExists = true;
    return true;
  }
}

describe("SeedWorkspaces", () => {
  test("creates every missing seed record", async () => {
    const repository = new RecordingSeedRepository();
    const service = new SeedWorkspaces(
      repository,
      new StubPasswordHasher(),
      canonicalize,
    );

    expect(
      await service.execute(WORKSPACES, "Commandix-demo-2026!"),
    ).toStrictEqual({
      tenantsCreated: 1,
      usersCreated: 2,
      templatesCreated: 1,
    });
  });

  test("does not hash or overwrite existing users", async () => {
    const repository = new RecordingSeedRepository();
    repository.users.add("admin@acme.test");
    const passwords = new StubPasswordHasher();
    const service = new SeedWorkspaces(repository, passwords, canonicalize);
    await service.execute(WORKSPACES, "Commandix-demo-2026!");

    expect(passwords.hashed).toStrictEqual(["Commandix-demo-2026!"]);
  });
});
