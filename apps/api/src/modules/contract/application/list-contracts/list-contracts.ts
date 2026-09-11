import type { ContractStatus } from "@/modules/contract/application/read-contract-detail/read-contract-detail";

export const CONTRACT_REGISTER_DEFAULT_LIMIT = 20;
export const CONTRACT_REGISTER_MAX_LIMIT = 100;

export type ContractRegisterItem = {
  id: string;
  status: ContractStatus;
  revision: number;
  createdAt: Date;
};

export type ContractRegisterBoundary = { createdAt: Date; id: string };

export type ContractRegisterPage = {
  items: ContractRegisterItem[];
  next: ContractRegisterBoundary | null;
};

export interface ContractRegisterRepository {
  findPage(input: {
    tenantId: string;
    limit: number;
    after: ContractRegisterBoundary | null;
  }): Promise<{ items: ContractRegisterItem[]; hasMore: boolean }>;
}

export type ListContractsInput = {
  tenantId: string;
  limit: number;
  after: ContractRegisterBoundary | null;
};

export class ListContracts {
  constructor(private readonly contracts: ContractRegisterRepository) {}

  async execute(input: ListContractsInput): Promise<ContractRegisterPage> {
    const page = await this.contracts.findPage({
      tenantId: input.tenantId,
      limit: input.limit,
      after: input.after,
    });
    const last = page.items.at(-1);

    return {
      items: page.items,
      next:
        page.hasMore && last
          ? {
              createdAt: last.createdAt,
              id: last.id,
            }
          : null,
    };
  }
}

export const CONTRACT_REGISTER_REPOSITORY = Symbol(
  "CONTRACT_REGISTER_REPOSITORY",
);
