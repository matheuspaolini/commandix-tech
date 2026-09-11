import type { ContractValues } from "@/contract/domain/contract-values";
import type { ContractStatus } from "./entities";

export type ContractSnapshot = {
  status: ContractStatus;
  revision: number;
  values: ContractValues;
  templateVersionId: string;
};
