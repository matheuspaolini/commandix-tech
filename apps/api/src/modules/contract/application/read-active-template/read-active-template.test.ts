import { describe, expect, test } from "bun:test";

import {
  type ActiveTemplate,
  type ActiveTemplateRepository,
} from "@/modules/contract/application/publish-template/active-template.repository";
import {
  ActiveTemplateNotFound,
  ReadActiveTemplate,
} from "@/modules/contract/application/read-active-template/read-active-template";

const ACTIVE_TEMPLATE = {
  logicalTemplateId: "logical-template-id",
  templateVersionId: "template-version-id",
  revision: 1,
  fields: [{ key: "title", label: "Title", type: "text", required: true }],
} satisfies ActiveTemplate;

class StubActiveTemplateRepository implements ActiveTemplateRepository {
  requestedTenantId: string | undefined;

  constructor(private readonly activeTemplate: ActiveTemplate | null) {}

  async findActiveByTenantId(tenantId: string) {
    this.requestedTenantId = tenantId;
    return this.activeTemplate;
  }
}

describe("ReadActiveTemplate", () => {
  test("returns the tenant's active immutable definition", async () => {
    const repository = new StubActiveTemplateRepository(ACTIVE_TEMPLATE);
    const service = new ReadActiveTemplate(repository);

    expect(await service.execute("tenant-id")).toStrictEqual(ACTIVE_TEMPLATE);
  });

  test("requires an active template", async () => {
    const repository = new StubActiveTemplateRepository(null);
    const service = new ReadActiveTemplate(repository);

    expect(service.execute("tenant-id")).rejects.toBeInstanceOf(
      ActiveTemplateNotFound,
    );
  });

  test("passes verified tenant scope to the repository", async () => {
    const repository = new StubActiveTemplateRepository(ACTIVE_TEMPLATE);
    const service = new ReadActiveTemplate(repository);
    await service.execute("verified-tenant-id");

    expect(repository.requestedTenantId).toBe("verified-tenant-id");
  });
});
