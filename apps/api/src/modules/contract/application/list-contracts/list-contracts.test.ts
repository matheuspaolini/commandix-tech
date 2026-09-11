import { expect, test } from "bun:test";
import { ListContracts } from "@/modules/contract/application/list-contracts/list-contracts";

test("returns a projection page and transport-neutral continuation boundary", async () => {
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

  const page = await useCase.execute({
    tenantId: "tenant-id",
    limit: 20,
    after: null,
  });

  expect({ requests, page }).toEqual({
    requests: [{ tenantId: "tenant-id", limit: 20, after: null }],
    page: {
      items: [
        {
          id: "8c3272ba-5192-4d55-817d-13f041850945",
          status: "DRAFT",
          revision: 1,
          createdAt: new Date("2026-09-11T12:30:00.000Z"),
        },
      ],
      next: {
        id: "8c3272ba-5192-4d55-817d-13f041850945",
        createdAt: new Date("2026-09-11T12:30:00.000Z"),
      },
    },
  });
});
