import { Injectable } from "@nestjs/common";

import { DatabaseService } from "@/database";
import type { ContractHistoryRepository } from "@/contract/application/read-contract-history/read-contract-history";

@Injectable()
export class PrismaContractHistoryRepository implements ContractHistoryRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByTenantAndContract(
    input: Parameters<ContractHistoryRepository["findByTenantAndContract"]>[0],
  ) {
    return this.database.client.$transaction(async (transaction) => {
      const contract = await transaction.contract.findFirst({
        where: { id: input.contractId, tenantId: input.tenantId },
        select: { id: true, status: true, revision: true },
      });
      if (!contract) return null;

      const entries = await transaction.contractHistory.findMany({
        where: {
          tenantId: input.tenantId,
          contractId: input.contractId,
        },
        select: {
          id: true,
          action: true,
          revision: true,
          occurredAt: true,
          beforeSnapshot: true,
          afterSnapshot: true,
          actor: { select: { id: true, email: true } },
        },
        orderBy: { revision: "asc" },
      });
      const versionIds = new Set<string>();
      for (const entry of entries) {
        addTemplateVersionId(versionIds, entry.beforeSnapshot);
        addTemplateVersionId(versionIds, entry.afterSnapshot);
      }
      const templateVersions = await transaction.templateVersion.findMany({
        where: {
          tenantId: input.tenantId,
          id: { in: [...versionIds] },
        },
        select: { id: true, definition: true },
      });

      return { contract, entries, templateVersions };
    });
  }
}

function addTemplateVersionId(ids: Set<string>, snapshot: unknown): void {
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    Array.isArray(snapshot)
  )
    return;
  const id = (snapshot as Record<string, unknown>).templateVersionId;
  if (typeof id === "string") ids.add(id);
}
