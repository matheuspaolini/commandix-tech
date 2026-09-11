import {
  decodeContractRegisterCursor,
  encodeContractRegisterCursor,
  InvalidContractPagination,
  type ContractRegisterBoundary,
} from "@/contract/application/list-contracts/contract-register-cursor";
import type { ContractStatus } from "@/contract/application/read-contract-detail/read-contract-detail";

export const CONTRACT_REGISTER_DEFAULT_LIMIT = 20;
export const CONTRACT_REGISTER_MAX_LIMIT = 100;

export type ContractRegisterItem = {
  id: string;
  status: ContractStatus;
  revision: number;
  createdAt: string;
};

export type ContractRegisterRecord = Omit<ContractRegisterItem, "createdAt"> & {
  createdAt: Date;
};

export type ContractRegisterPage = {
  items: ContractRegisterItem[];
  nextCursor: string | null;
};

export interface ContractRegisterRepository {
  findPage(input: {
    tenantId: string;
    limit: number;
    after: ContractRegisterBoundary | null;
  }): Promise<{ items: ContractRegisterRecord[]; hasMore: boolean }>;
}

export class ListContracts {
  constructor(private readonly contracts: ContractRegisterRepository) {}

  async execute(query: {
    tenantId: string;
    limit?: number;
    after?: string;
  }): Promise<ContractRegisterPage> {
    const limit = query.limit ?? CONTRACT_REGISTER_DEFAULT_LIMIT;
    const after = decodeContractRegisterCursor(query.after);
    const page = await this.contracts.findPage({
      tenantId: query.tenantId,
      limit,
      after,
    });
    const last = page.items.at(-1);

    return {
      items: page.items.map((contract) => ({
        ...contract,
        createdAt: contract.createdAt.toISOString(),
      })),
      nextCursor:
        page.hasMore && last
          ? encodeContractRegisterCursor({
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
    };
  }
}

export function parseContractRegisterQuery(query: Record<string, unknown>): {
  limit: number;
  after?: string;
} {
  if (Object.keys(query).some((key) => key !== "limit" && key !== "after"))
    throw new InvalidContractPagination();

  const limitValue = query.limit;
  const afterValue = query.after;
  if (
    limitValue !== undefined &&
    (typeof limitValue !== "string" || !/^[1-9]\d*$/.test(limitValue))
  )
    throw new InvalidContractPagination();
  if (
    afterValue !== undefined &&
    (typeof afterValue !== "string" || afterValue.length === 0)
  )
    throw new InvalidContractPagination();

  const limit =
    limitValue === undefined
      ? CONTRACT_REGISTER_DEFAULT_LIMIT
      : Number(limitValue);
  if (!Number.isSafeInteger(limit) || limit > CONTRACT_REGISTER_MAX_LIMIT)
    throw new InvalidContractPagination();

  return {
    limit,
    ...(typeof afterValue === "string" ? { after: afterValue } : {}),
  };
}

export const CONTRACT_REGISTER_REPOSITORY = Symbol(
  "CONTRACT_REGISTER_REPOSITORY",
);
