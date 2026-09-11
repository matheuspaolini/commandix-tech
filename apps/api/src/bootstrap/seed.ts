import { BunPasswordHasher } from "@/platform/password-hasher";
import { canonicalIdentity } from "@/modules/tenant/tenant.contract";
import { PrismaSeedWorkspaceRepository } from "@/bootstrap/prisma-seed-workspace.repository";
import { SeedWorkspaces } from "@/bootstrap/seed-workspaces";
import { DatabaseService } from "@/platform/database";
import { databaseConnectionConfigFromEnvironment } from "@/platform/runtime-config";

const DEVELOPMENT_PASSWORD = "Commandix-demo-2026!";
const SEEDED_TEMPLATE = {
  fields: [
    { key: "title", label: "Title", type: "text" as const, required: true },
    {
      key: "amount",
      label: "Amount",
      type: "number" as const,
      required: false,
      default: 0,
    },
    {
      key: "effective-date",
      label: "Effective date",
      type: "date" as const,
      required: true,
    },
    {
      key: "approved",
      label: "Approved",
      type: "boolean" as const,
      required: false,
      default: false,
    },
    {
      key: "category",
      label: "Category",
      type: "enum" as const,
      required: true,
      options: ["standard", "premium"],
      default: "standard",
    },
  ],
};
const SEED_WORKSPACES = ["acme", "globex"].map((slug) => ({
  slug,
  users: [
    { email: `admin@${slug}.test`, role: "ADMIN" as const },
    { email: `member@${slug}.test`, role: "MEMBER" as const },
  ],
  template: SEEDED_TEMPLATE,
}));

async function seed(): Promise<void> {
  const database = new DatabaseService(
    databaseConnectionConfigFromEnvironment(),
  );
  try {
    const workspaces = new SeedWorkspaces(
      new PrismaSeedWorkspaceRepository(database),
      new BunPasswordHasher(),
      canonicalIdentity,
    );
    const counts = await workspaces.execute(
      SEED_WORKSPACES,
      DEVELOPMENT_PASSWORD,
    );
    console.log(JSON.stringify({ event: "seed_completed", ...counts }));
  } finally {
    await database.onModuleDestroy();
  }
}

void seed().catch(() => {
  console.error(JSON.stringify({ event: "seed_failed" }));
  process.exitCode = 1;
});
