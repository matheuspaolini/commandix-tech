import { describe, expect, test } from "bun:test";

import type { ActiveTemplate } from "@/contract/application/publish-template/active-template.repository";
import {
  PutActiveTemplate,
  TemplateRevisionConflict,
  type LockedLogicalTemplate,
  type TemplatePublicationTransaction,
  type TemplatePublicationTransactions,
} from "@/contract/application/publish-template/template-publication";
import {
  LogicalTemplateEntity,
  LogicalTemplateIdentifier,
  TemplateVersionEntity,
  TemplateVersionIdentifier,
  TenantIdentifier,
} from "@/contract/domain/entities";
import {
  canonicalTemplateDefinition,
  InvalidTemplateDefinition,
  type TemplateDefinition,
} from "@/contract/domain/template-definition";

const DEFINITION = canonicalTemplateDefinition({
  fields: [{ key: "title", label: "Title", type: "text", required: true }],
});

function lockedTemplate(
  definition = DEFINITION,
  revision = 2,
): LockedLogicalTemplate {
  const tenantId = TenantIdentifier.from("tenant-id");
  const logicalTemplateId = LogicalTemplateIdentifier.from(
    "logical-template-id",
  );
  return {
    logicalTemplate: LogicalTemplateEntity.reconstitute({
      id: logicalTemplateId,
      tenantId,
      revision,
      activeVersionId: TemplateVersionIdentifier.from("version-id"),
    }),
    activeVersion: TemplateVersionEntity.reconstitute({
      id: TemplateVersionIdentifier.from("version-id"),
      logicalTemplateId,
      tenantId,
      definition,
    }),
  };
}

const CURRENT = lockedTemplate();

class StubTransaction implements TemplatePublicationTransaction {
  persistence: "NONE" | "CREATED" | "PUBLISHED" = "NONE";

  constructor(
    readonly current: LockedLogicalTemplate | null,
    private readonly tenantExists = true,
  ) {}

  async lockTenant(): Promise<boolean> {
    return this.tenantExists;
  }

  async findLogicalTemplateForUpdate() {
    return this.current;
  }

  async createInitial(input: {
    logicalTemplate: LogicalTemplateEntity;
    version: TemplateVersionEntity;
  }): Promise<ActiveTemplate> {
    this.persistence = "CREATED";
    return {
      ...input.logicalTemplate.activeTemplate(),
      fields: input.version.definitionForPresentation().fields,
    };
  }

  async publishNext(input: {
    logicalTemplate: LogicalTemplateEntity;
    version: TemplateVersionEntity;
  }): Promise<ActiveTemplate> {
    this.persistence = "PUBLISHED";
    return {
      ...input.logicalTemplate.activeTemplate(),
      fields: input.version.definitionForPresentation().fields,
    };
  }
}

class StubTransactions implements TemplatePublicationTransactions {
  constructor(readonly transaction: StubTransaction) {}

  run<T>(
    operation: (transaction: TemplatePublicationTransaction) => Promise<T>,
  ): Promise<T> {
    return operation(this.transaction);
  }
}

function execute(
  transaction: StubTransaction,
  expectedRevision: number,
  definition: unknown = DEFINITION,
) {
  const ids = transaction.current
    ? ["next-version-id"]
    : ["created-version-id", "created-template-id"];
  return new PutActiveTemplate(new StubTransactions(transaction), {
    next: () => ids.shift()!,
  }).execute({
    tenantId: "tenant-id",
    actorId: "actor-id",
    expectedRevision,
    definition,
  });
}

describe("PutActiveTemplate", () => {
  test("creates the first canonical version when absence is expected", async () => {
    const transaction = new StubTransaction(null);

    expect({
      result: await execute(transaction, 0),
      persistence: transaction.persistence,
    }).toStrictEqual({
      result: {
        outcome: "CREATED",
        template: {
          logicalTemplateId: "created-template-id",
          templateVersionId: "created-version-id",
          revision: 1,
          fields: DEFINITION.fields,
        },
      },
      persistence: "CREATED",
    });
  });

  test("rejects both kinds of expected-state mismatch", async () => {
    const existing = await execute(new StubTransaction(CURRENT), 0).catch(
      (error) => error,
    );
    const missing = await execute(new StubTransaction(null), 2).catch(
      (error) => error,
    );

    expect({ existing, missing }).toEqual({
      existing: expect.any(TemplateRevisionConflict),
      missing: expect.any(TemplateRevisionConflict),
    });
  });

  test("checks a stale revision before semantic validity", async () => {
    expect(
      execute(new StubTransaction(CURRENT), 1, { fields: [] }),
    ).rejects.toBeInstanceOf(TemplateRevisionConflict);
  });

  test("rejects an invalid definition after a matching revision", async () => {
    expect(
      execute(new StubTransaction(CURRENT), 2, { fields: [] }),
    ).rejects.toBeInstanceOf(InvalidTemplateDefinition);
  });

  test("returns the stored order without persistence for semantic equality", async () => {
    const current = lockedTemplate(
      canonicalTemplateDefinition({
        fields: [
          ...DEFINITION.fields,
          {
            key: "category",
            label: "Category",
            type: "enum",
            required: false,
            options: ["Standard", "Custom"],
          },
        ],
      }),
    );
    const transaction = new StubTransaction(current);
    const reordered = {
      fields: [
        {
          key: "category",
          label: "Category",
          type: "enum",
          required: false,
          options: ["Custom", "Standard"],
        },
        ...DEFINITION.fields,
      ],
    };

    expect({
      result: await execute(transaction, 2, reordered),
      persistence: transaction.persistence,
    }).toStrictEqual({
      result: {
        outcome: "UNCHANGED",
        template: {
          logicalTemplateId: current.logicalTemplate.id.value,
          templateVersionId: current.activeVersion.id.value,
          revision: 2,
          fields: current.activeVersion.definition.fields,
        },
      },
      persistence: "NONE",
    });
  });

  test("publishes a canonical changed definition at the next revision", async () => {
    const transaction = new StubTransaction(CURRENT);
    const changed: TemplateDefinition = {
      fields: [
        { key: "title", label: "Document title", type: "text", required: true },
      ],
    };

    expect({
      result: await execute(transaction, 2, changed),
      persistence: transaction.persistence,
    }).toStrictEqual({
      result: {
        outcome: "PUBLISHED",
        template: {
          logicalTemplateId: CURRENT.logicalTemplate.id.value,
          templateVersionId: "next-version-id",
          revision: 3,
          fields: changed.fields,
        },
      },
      persistence: "PUBLISHED",
    });
  });
});
