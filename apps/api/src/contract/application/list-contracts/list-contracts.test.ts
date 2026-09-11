import { expect, test } from "bun:test";
import {
  ListContracts,
  parseContractRegisterQuery,
} from "@/contract/application/list-contracts/list-contracts";
import { InvalidContractPagination } from "@/contract/application/list-contracts/contract-register-cursor";

test("maps a repository page and creates its continuation cursor", async () => {
  const requests: unknown[] = [];
  const useCase = new ListContracts({
    findPage: async (input) => {
      requests.push(input);
      return {
        items: [
          {
            id: "8c3272ba-5192-4d55-817d-13f041850945",
            status: "DRAFT",
            revision: 1,
            createdAt: new Date("2026-09-11T12:30:00.000Z"),
          },
        ],
        hasMore: true,
      };
    },
  });

  const page = await useCase.execute({ tenantId: "tenant-id" });

  expect({ requests, page }).toEqual({
    requests: [{ tenantId: "tenant-id", limit: 20, after: null }],
    page: {
      items: [
        {
          id: "8c3272ba-5192-4d55-817d-13f041850945",
          status: "DRAFT",
          revision: 1,
          createdAt: "2026-09-11T12:30:00.000Z",
        },
      ],
      nextCursor: expect.any(String),
    },
  });
});

test("parses only documented Contract register parameters", () => {
  expect({
    defaults: parseContractRegisterQuery({}),
    maximum: parseContractRegisterQuery({ limit: "100", after: "cursor" }),
    invalid: ["", "0", "1.5", "101"].map((limit) => {
      try {
        parseContractRegisterQuery({ limit });
        return false;
      } catch (error) {
        return error instanceof InvalidContractPagination;
      }
    }),
  }).toEqual({
    defaults: { limit: 20 },
    maximum: { limit: 100, after: "cursor" },
    invalid: [true, true, true, true],
  });
});
