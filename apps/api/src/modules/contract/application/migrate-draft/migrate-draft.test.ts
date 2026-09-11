import { expect, test } from "bun:test";

import type {
  DraftMigrationTransaction,
  LockedDraftMigration,
} from "@/modules/contract/application/migrate-draft/draft-migration-transaction";
import {
  ContractRevisionConflict,
  MigrateDraft,
  TemplateVersionNotActive,
  TemplateVersionNotFound,
} from "@/modules/contract/application/migrate-draft/migrate-draft";

const CURRENT = {
  id: "contract-id",
  tenantId: "tenant-id",
  status: "DRAFT" as const,
  revision: 1,
  values: { title: "Agreement", amount: 100 },
  templateVersion: {
    id: "current-version-id",
    fields: [
      { key: "title", label: "Title", type: "text" as const, required: true },
      {
        key: "amount",
        label: "Amount",
        type: "number" as const,
        required: false,
        default: 100,
      },
    ],
  },
};

const TARGET = {
  id: "target-version-id",
  fields: [
    {
      key: "title",
      label: "Document title",
      type: "text" as const,
      required: true,
    },
    {
      key: "approved",
      label: "Approved",
      type: "boolean" as const,
      required: false,
    },
  ],
};

function migrationFor(
  overrides: Partial<LockedDraftMigration> = {},
): DraftMigrationTransaction & { persisted?: unknown } {
  const transaction: DraftMigrationTransaction & { persisted?: unknown } = {
    loadForMigration: async () => ({
      contract: CURRENT,
      activeTemplateVersionId: TARGET.id,
      targetTemplateVersion: TARGET,
      ...overrides,
    }),
    persistMigration: async (input) => {
      transaction.persisted = input;
    },
  };
  return transaction;
}

function migration(transaction: DraftMigrationTransaction) {
  return new MigrateDraft(
    { run: (operation) => operation(transaction) },
    { now: () => new Date("2026-09-11T16:00:00.000Z") },
    { next: () => "history-id" },
  );
}

test("migrates a Draft with complete target values and version-aware History", async () => {
  const transaction = migrationFor();

  const result = await migration(transaction).execute({
    tenantId: "tenant-id",
    actorId: "actor-id",
    contractId: "contract-id",
    expectedRevision: 1,
    targetVersionId: TARGET.id,
    suppliedValues: { title: "Migrated agreement", approved: false },
  });

  expect({ result, persisted: transaction.persisted }).toStrictEqual({
    result: {
      id: "contract-id",
      status: "DRAFT",
      revision: 2,
      values: { title: "Migrated agreement", approved: false },
      templateVersion: TARGET,
    },
    persisted: {
      contract: {
        id: "contract-id",
        tenantId: "tenant-id",
        templateVersionId: TARGET.id,
        revision: 2,
        values: { title: "Migrated agreement", approved: false },
      },
      history: {
        id: "history-id",
        tenantId: "tenant-id",
        contractId: "contract-id",
        actorId: "actor-id",
        action: "MIGRATED",
        revision: 2,
        occurredAt: new Date("2026-09-11T16:00:00.000Z"),
        before: {
          status: "DRAFT",
          revision: 1,
          values: { title: "Agreement", amount: 100 },
          templateVersionId: "current-version-id",
        },
        after: {
          status: "DRAFT",
          revision: 2,
          values: { title: "Migrated agreement", approved: false },
          templateVersionId: TARGET.id,
        },
      },
    },
  });
});

test("returns a same-version no-op without generating audit data", async () => {
  const transaction = migrationFor({
    activeTemplateVersionId: CURRENT.templateVersion.id,
    targetTemplateVersion: CURRENT.templateVersion,
  });
  let generated = false;
  const useCase = new MigrateDraft(
    { run: (operation) => operation(transaction) },
    {
      now: () => {
        throw new Error("clock should not run");
      },
    },
    {
      next: () => {
        generated = true;
        return "unused";
      },
    },
  );

  const result = await useCase.execute({
    tenantId: "tenant-id",
    actorId: "actor-id",
    contractId: "contract-id",
    expectedRevision: 1,
    targetVersionId: CURRENT.templateVersion.id,
    suppliedValues: { amount: 100, title: "Agreement" },
  });

  expect({ result, persisted: transaction.persisted, generated }).toStrictEqual(
    {
      result: {
        id: "contract-id",
        status: "DRAFT",
        revision: 1,
        values: { title: "Agreement", amount: 100 },
        templateVersion: CURRENT.templateVersion,
      },
      persisted: undefined,
      generated: false,
    },
  );
});

test("checks target existence before revision and target activity before values", async () => {
  const missingTarget = await migration(
    migrationFor({ targetTemplateVersion: null }),
  )
    .execute({
      tenantId: "tenant-id",
      actorId: "actor-id",
      contractId: "contract-id",
      expectedRevision: 0,
      targetVersionId: "target-version-id",
      suppliedValues: null,
    })
    .catch((error: unknown) => error);
  const inactiveTarget = await migration(
    migrationFor({ activeTemplateVersionId: "newer-version-id" }),
  )
    .execute({
      tenantId: "tenant-id",
      actorId: "actor-id",
      contractId: "contract-id",
      expectedRevision: 1,
      targetVersionId: TARGET.id,
      suppliedValues: null,
    })
    .catch((error: unknown) => error);
  const stale = await migration(migrationFor())
    .execute({
      tenantId: "tenant-id",
      actorId: "actor-id",
      contractId: "contract-id",
      expectedRevision: 0,
      targetVersionId: TARGET.id,
      suppliedValues: null,
    })
    .catch((error: unknown) => error);

  expect({
    missingTarget: missingTarget instanceof TemplateVersionNotFound,
    inactiveTarget: inactiveTarget instanceof TemplateVersionNotActive,
    stale: stale instanceof ContractRevisionConflict,
  }).toStrictEqual({
    missingTarget: true,
    inactiveTarget: true,
    stale: true,
  });
});

test("serializes competing current-revision migrations to one persisted change", async () => {
  let current: LockedDraftMigration["contract"] = {
    ...CURRENT,
    values: { ...CURRENT.values },
  };
  const transaction: DraftMigrationTransaction = {
    loadForMigration: async () => ({
      contract: current,
      activeTemplateVersionId: TARGET.id,
      targetTemplateVersion: TARGET,
    }),
    persistMigration: async (input) => {
      current = {
        ...current,
        revision: input.contract.revision,
        values: input.contract.values,
        templateVersion: TARGET,
      };
    },
  };
  let tail = Promise.resolve();
  const transactions = {
    run: async <T>(
      operation: (locked: DraftMigrationTransaction) => Promise<T>,
    ) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await operation(transaction);
      } finally {
        release();
      }
    },
  };
  const collaborators = [
    { now: () => new Date(0) },
    { next: () => "unused-id" },
  ] as const;
  const first = new MigrateDraft(transactions, ...collaborators);
  const second = new MigrateDraft(transactions, ...collaborators);

  const outcomes = await Promise.allSettled([
    first.execute({
      tenantId: "tenant-id",
      actorId: "actor-id",
      contractId: "contract-id",
      expectedRevision: 1,
      targetVersionId: TARGET.id,
      suppliedValues: { title: "First", approved: false },
    }),
    second.execute({
      tenantId: "tenant-id",
      actorId: "actor-id",
      contractId: "contract-id",
      expectedRevision: 1,
      targetVersionId: TARGET.id,
      suppliedValues: { title: "Second", approved: false },
    }),
  ]);

  expect({
    outcomes: outcomes.map(({ status }) => status).sort(),
    revision: current.revision,
  }).toStrictEqual({ outcomes: ["fulfilled", "rejected"], revision: 2 });
});
