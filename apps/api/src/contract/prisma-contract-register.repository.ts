import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database";
import type { ContractRegisterRepository } from "./list-contracts";

@Injectable()
export class PrismaContractRegisterRepository implements ContractRegisterRepository {
  constructor(private readonly database: DatabaseService) {}

  async findPage(input: Parameters<ContractRegisterRepository["findPage"]>[0]) {
    const boundary = input.after
      ? {
          OR: [
            { createdAt: { lt: input.after.createdAt } },
            {
              createdAt: input.after.createdAt,
              id: { lt: input.after.id },
            },
          ],
        }
      : {};
    const rows = await this.database.client.contract.findMany({
      where: { tenantId: input.tenantId, ...boundary },
      select: { id: true, status: true, revision: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });

    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }
}
