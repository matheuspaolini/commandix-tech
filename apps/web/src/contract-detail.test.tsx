import { expect, test } from "bun:test";
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router";

import { ApiResponseError, type ContractDetail } from "@/shared/api";
import { render } from "@/shared/test";
import {
  ContractDetailPage,
  formatCalendarDate,
  formatContractStatus,
  formatContractValue,
  type ContractDetailSession,
} from "./contract-detail";

const CONTRACT_ID = "8c3272ba-5192-4d55-817d-13f041850945";
const VERSION_ID = "ed174ad1-3d85-49d1-84ed-9a6d14d4cc69";
const contract: ContractDetail = {
  id: CONTRACT_ID,
  status: "DRAFT",
  revision: 1,
  values: {
    title: "Agreement",
    notes: "",
    amount: 0,
    approved: false,
    date: "2026-09-10",
    category: "premium",
  },
  templateVersion: {
    id: VERSION_ID,
    fields: [
      { key: "title", label: "Agreement title", type: "text", required: true },
      { key: "notes", label: "Notes", type: "text", required: false },
      { key: "amount", label: "Amount", type: "number", required: false },
      { key: "approved", label: "Approved", type: "boolean", required: false },
      { key: "date", label: "Start date", type: "date", required: true },
      {
        key: "category",
        label: "Category",
        type: "enum",
        required: true,
        options: ["premium"],
      },
      { key: "reference", label: "Reference", type: "text", required: false },
    ],
  },
};

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderDetail(
  session: ContractDetailSession,
  contractId = CONTRACT_ID,
) {
  return render(
    <MemoryRouter initialEntries={[`/contracts/${contractId}`]}>
      <Routes>
        <Route
          path="/contracts/:contractId"
          element={
            <ContractDetailPage
              session={session}
              onAuthenticationLost={() => undefined}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

test("renders the saved definition and distinct falsy and absent values", async () => {
  const session = {
    requestJson: async () => contract,
  } as ContractDetailSession;
  await renderDetail(session);
  await settle();

  expect(document.body.textContent).toContain(
    "Draft contractDraftContract ID8c3272ba-5192-4d55-817d-13f041850945Revision1Template versioned174ad1-3d85-49d1-84ed-9a6d14d4cc69Contract detailsAgreement titleAgreementNotesEmpty textAmount0ApprovedNoStart date10 September 2026CategorypremiumReferenceNot providedBack to home",
  );
});

test("does not request a malformed Contract identifier", async () => {
  let requests = 0;
  const session = {
    requestJson: async () => {
      requests += 1;
      return contract;
    },
  } as ContractDetailSession;
  await renderDetail(session, "not-a-uuid");
  await settle();

  expect({ requests, message: document.body.textContent }).toEqual({
    requests: 0,
    message: expect.stringContaining("Contract not found"),
  });
});

test("distinguishes a missing Contract from a retryable request failure", async () => {
  const missing = {
    requestJson: async () => {
      throw new ApiResponseError(404);
    },
  } as ContractDetailSession;
  await renderDetail(missing);
  await settle();
  const missingMessage = document.body.textContent;

  const failed = {
    requestJson: async () => {
      throw new Error("offline");
    },
  } as ContractDetailSession;
  await renderDetail(failed);
  await settle();

  expect({ missingMessage, failedMessage: document.body.textContent }).toEqual({
    missingMessage: expect.stringContaining("Contract not found"),
    failedMessage: expect.stringContaining("The contract could not be opened"),
  });
});

test("retries the current Contract request", async () => {
  let requests = 0;
  const session = {
    requestJson: async () => {
      requests += 1;
      if (requests === 1) throw new Error("offline");
      return contract;
    },
  } as ContractDetailSession;
  await renderDetail(session);
  await settle();
  const retry = document.querySelector("button");
  if (!(retry instanceof HTMLButtonElement)) throw new Error("Missing retry");
  await act(async () => {
    retry.click();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect({ requests, message: document.body.textContent }).toEqual({
    requests: 2,
    message: expect.stringContaining("Agreement titleAgreement"),
  });
});

test("formats calendar and field values without timezone or truthiness coercion", () => {
  expect({
    date: formatCalendarDate("2028-02-29"),
    absent: formatContractValue({
      field: { key: "value", label: "Value", type: "text", required: false },
      values: {},
    }),
    empty: formatContractValue({
      field: { key: "value", label: "Value", type: "text", required: false },
      values: { value: "" },
    }),
  }).toEqual({
    date: "29 February 2028",
    absent: "Not provided",
    empty: "Empty text",
  });
});

test("presents every Contract lifecycle status", () => {
  expect(
    (["DRAFT", "ACTIVE", "CLOSED"] as const).map(formatContractStatus),
  ).toEqual(["Draft", "Active", "Closed"]);
});

test("reports an expired authenticated session", async () => {
  let authenticationLost = false;
  const session = {
    requestJson: async () => {
      throw new ApiResponseError(401);
    },
  } as ContractDetailSession;
  await render(
    <MemoryRouter initialEntries={[`/contracts/${CONTRACT_ID}`]}>
      <Routes>
        <Route
          path="/contracts/:contractId"
          element={
            <ContractDetailPage
              session={session}
              onAuthenticationLost={() => {
                authenticationLost = true;
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  await settle();

  expect(authenticationLost).toBe(true);
});
