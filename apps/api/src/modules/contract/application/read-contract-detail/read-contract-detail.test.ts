import { expect, test } from "bun:test";

import {
  ContractNotFound,
  ReadContractDetail,
  type ContractDetailRepository,
} from "@/modules/contract/application/read-contract-detail/read-contract-detail";

const savedContract = {
  id: "contract-id",
  status: "DRAFT" as const,
  revision: 1,
  values: { approved: false, amount: 0, notes: "" },
  templateVersion: {
    id: "saved-version",
    definition: {
      fields: [
        {
          key: "approved",
          label: "Was approved",
          type: "boolean" as const,
          required: false,
        },
      ],
    },
  },
};

test("reads the Contract through its Tenant-scoped repository query", async () => {
  let received: unknown;
  const contracts: ContractDetailRepository = {
    findByTenantAndId: async (input) => {
      received = input;
      return savedContract;
    },
  };

  const detail = await new ReadContractDetail(contracts).execute({
    tenantId: "tenant-id",
    contractId: "contract-id",
  });

  expect({ received, detail }).toStrictEqual({
    received: { tenantId: "tenant-id", contractId: "contract-id" },
    detail: {
      id: "contract-id",
      status: "DRAFT",
      revision: 1,
      values: { approved: false, amount: 0, notes: "" },
      templateVersion: {
        id: "saved-version",
        fields: savedContract.templateVersion.definition.fields,
      },
    },
  });
});

test("reports a missing Contract without inventing a response", async () => {
  const useCase = new ReadContractDetail({
    findByTenantAndId: async () => null,
  });

  let error: unknown;
  try {
    await useCase.execute({ tenantId: "tenant-id", contractId: "missing-id" });
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(ContractNotFound);
});

test("preserves every persisted Contract lifecycle status", async () => {
  const statuses = ["DRAFT", "ACTIVE", "CLOSED"] as const;
  const results = await Promise.all(
    statuses.map((status) =>
      new ReadContractDetail({
        findByTenantAndId: async () => ({ ...savedContract, status }),
      }).execute({ tenantId: "tenant-id", contractId: "contract-id" }),
    ),
  );

  expect(results.map((result) => result.status)).toEqual([...statuses]);
});
