import type { ContractValues } from "./contract-values";
import type { ContractStatus } from "./read-contract-detail";

export type ContractSnapshot = {
  status: ContractStatus;
  revision: number;
  values: ContractValues;
  templateVersionId: string;
};
