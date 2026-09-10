import { expect, test } from "bun:test";
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { render } from "@/shared/test";
import {
  ContractHistoryPage,
  type ContractHistorySession,
} from "./contract-history";

const CONTRACT_ID = "8c3272ba-5192-4d55-817d-13f041850945";
const HISTORY_ID = "00add474-cb25-4e72-891d-2548b781a469";
const ACTOR_ID = "13bccb75-b3ff-4f1c-9bbe-cb6b4d4acccf";
const VERSION_ID = "ed174ad1-3d85-49d1-84ed-9a6d14d4cc69";

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderHistory(
  session: ContractHistorySession,
  contractId = CONTRACT_ID,
) {
  return render(
    <MemoryRouter initialEntries={[`/contracts/${contractId}/history`]}>
      <Routes>
        <Route
          path="/contracts/:contractId/history"
          element={
            <ContractHistoryPage
              session={session}
              onAuthenticationLost={() => undefined}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

test("renders creation with actor and its version-aware New state", async () => {
  await renderHistory({
    requestJson: async () => ({
      contract: { id: CONTRACT_ID, status: "DRAFT", revision: 1 },
      entries: [
        {
          id: HISTORY_ID,
          action: "CREATED",
          revision: 1,
          occurredAt: "2026-09-11T12:30:00.000Z",
          actor: { id: ACTOR_ID, email: "admin@acme.test" },
          before: null,
          after: {
            status: "DRAFT",
            revision: 1,
            values: { title: "Agreement", approved: false },
            templateVersion: {
              id: VERSION_ID,
              fields: [
                {
                  key: "title",
                  label: "Historic title",
                  type: "text",
                  required: true,
                },
                {
                  key: "approved",
                  label: "Approved",
                  type: "boolean",
                  required: false,
                },
              ],
            },
          },
        },
      ],
    }),
  } as ContractHistorySession);
  await settle();

  expect({
    actorAndCreation: document.body.textContent?.includes(
      `Changed by admin@acme.test ${ACTOR_ID}No previous state — this revision created the contract.`,
    ),
    resolvedState: document.body.textContent?.includes(
      `New stateStatusDraftRevision1Template version${VERSION_ID}Historic titleAgreementApprovedNo`,
    ),
    timestamp: document.querySelector("time")?.getAttribute("datetime"),
  }).toEqual({
    actorAndCreation: true,
    resolvedState: true,
    timestamp: "2026-09-11T12:30:00.000Z",
  });
});

test("does not request a malformed history identifier", async () => {
  let requests = 0;
  await renderHistory(
    {
      requestJson: async () => {
        requests += 1;
        throw new Error("Unexpected request");
      },
    },
    "not-a-uuid",
  );
  await settle();

  expect({ requests, content: document.body.textContent }).toEqual({
    requests: 0,
    content: expect.stringContaining("Contract history not found"),
  });
});
