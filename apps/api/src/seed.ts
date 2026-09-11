import { BunPasswordHasher } from "./platform/password-hasher";
import { canonicalTemplateDefinition } from "@/contract/domain/template-definition";
import { PrismaSeedWorkspaceRepository } from "@/contract/infrastructure/prisma-seed-workspace.repository";
import { SeedWorkspaces } from "@/contract/application/seed-workspaces/seed-workspaces";
import { DatabaseService } from "./database";
import { runtimeConfigFromEnvironment } from "./runtime-config";

const DEVELOPMENT_PASSWORD = "Commandix-demo-2026!";
const SEEDED_TEMPLATE = canonicalTemplateDefinition({
  fields: [
    { key: "title", label: "Title", type: "text", required: true },
    {
      key: "amount",
      label: "Amount",
      type: "number",
      required: false,
      default: 0,
    },
    {
      key: "effective-date",
      label: "Effective date",
      type: "date",
      required: true,
    },
    {
      key: "approved",
      label: "Approved",
      type: "boolean",
      required: false,
      default: false,
    },
    {
      key: "category",
      label: "Category",
      type: "enum",
      required: true,
      options: ["standard", "premium"],
      default: "standard",
    },
  ],
});
const SEED_WORKSPACES = ["acme", "globex"].map((slug) => ({
  slug,
  users: [
    { email: `admin@${slug}.test`, role: "ADMIN" as const },
    { email: `member@${slug}.test`, role: "MEMBER" as const },
  ],
  template: SEEDED_TEMPLATE,
}));

async function seed(): Promise<void> {
  const database = new DatabaseService(runtimeConfigFromEnvironment());
  try {
    const workspaces = new SeedWorkspaces(
      new PrismaSeedWorkspaceRepository(database),
      new BunPasswordHasher(),
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
