import { expect, test } from "bun:test";
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { ApiResponseError } from "@/shared/api";
import { render } from "@/shared/test";
import {
  ContractRegister,
  type ContractRegisterSession,
} from "./contract-register";

const CONTRACT_ID = "8c3272ba-5192-4d55-817d-13f041850945";

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderRegister(session: ContractRegisterSession, route = "/") {
  await render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route
          path="/"
          element={
            <ContractRegister
              session={session}
              onAuthenticationLost={() => undefined}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  await settle();
}

test("renders Contract metadata and distinct navigation links", async () => {
  await renderRegister({
    requestJson: async () => ({
      items: [
        {
          id: CONTRACT_ID,
          status: "DRAFT",
          revision: 1,
          createdAt: "2026-09-11T12:30:00.000Z",
        },
      ],
      nextCursor: "next-page",
    }),
  } as ContractRegisterSession);

  expect({
    content: document.body.textContent,
    links: [...document.querySelectorAll("a")].map((link) =>
      link.getAttribute("href"),
    ),
    timestamp: document.querySelector("time")?.getAttribute("datetime"),
  }).toEqual({
    content: expect.stringContaining(`${CONTRACT_ID}DraftRevision1`),
    links: [`/contracts/${CONTRACT_ID}`, `/contracts/${CONTRACT_ID}/history`],
    timestamp: "2026-09-11T12:30:00.000Z",
  });
});

test("explains an invalid register page and can reset it", async () => {
  await renderRegister(
    {
      requestJson: async () => {
        throw new ApiResponseError(400, { code: "INVALID_PAGINATION" });
      },
    } as ContractRegisterSession,
    "/?after=bad",
  );

  expect(document.body.textContent).toContain(
    "This register page address is invalid or incomplete.Return to newest",
  );
});
