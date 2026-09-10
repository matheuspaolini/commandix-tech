import { expect, spyOn, test } from "bun:test";
import { act } from "react";
import { MemoryRouter } from "react-router";

import { API_ENDPOINTS } from "@/shared/api";
import {
  ACCESS_TOKEN,
  createIdentityFixture,
  fetchImplementation,
  getInput,
  getSubmitButton,
  jsonResponse,
  render,
  setInputValue,
  SIGN_IN_FORM,
  submitForm,
} from "@/shared/test";

import { validateReturnTo, Workspace } from "./workspace";

function getRequestUrl(input: string | URL | Request): string {
  return input instanceof Request ? input.url : input.toString();
}

function mockRequests(
  implementation: (
    url: string,
    init?: RequestInit,
  ) => Response | Promise<Response>,
) {
  return spyOn(globalThis, "fetch").mockImplementation(
    fetchImplementation(async (input, init) =>
      implementation(getRequestUrl(input), init),
    ),
  );
}

async function renderSignedOut(initialEntry = "/") {
  mockRequests(() => jsonResponse({}, { status: 401 }));
  await renderWorkspace(initialEntry);
  await settle();
}

function renderWorkspace(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Workspace />
    </MemoryRouter>,
  );
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function fillSignInForm() {
  setInputValue("tenant-slug", SIGN_IN_FORM.slug);
  setInputValue("email", SIGN_IN_FORM.email);
  setInputValue("password", SIGN_IN_FORM.password);
}

test("restoration displays a neutral pending state", async () => {
  let resolveRequest!: (response: Response) => void;
  mockRequests(
    () =>
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
  );
  await renderWorkspace();
  expect(document.body.textContent).toContain("Restoring your session");
  resolveRequest(jsonResponse({}, { status: 401 }));
  await settle();
});

test("failed restoration displays the sign-in form", async () => {
  await renderSignedOut();
  expect(document.body.textContent).toContain("Sign in to Commandix");
});

test("sign-in controls have accessible labels", async () => {
  await renderSignedOut();
  expect(
    ["tenant-slug", "email", "password"].map(
      (id) => getInput(id).labels?.length,
    ),
  ).toEqual([1, 1, 1]);
});

test("successful sign-in displays the tenant workspace", async () => {
  await renderSignedOut();
  mockRequests((url) =>
    url === API_ENDPOINTS.signIn
      ? jsonResponse({ accessToken: ACCESS_TOKEN })
      : jsonResponse(createIdentityFixture()),
  );
  fillSignInForm();
  await submitForm();
  expect(document.body.textContent).toContain("You are signed in");
});

test("sign-out clears the authenticated workspace", async () => {
  await renderSignedOut();
  mockRequests((url) =>
    url === API_ENDPOINTS.signIn
      ? jsonResponse({ accessToken: ACCESS_TOKEN })
      : url === API_ENDPOINTS.identity
        ? jsonResponse(createIdentityFixture())
        : new Response(null, { status: 204 }),
  );
  fillSignInForm();
  await submitForm();
  const signOutButton = document.querySelector("button[type=button]");
  if (!(signOutButton instanceof HTMLButtonElement)) {
    throw new Error("Sign-out button was not found");
  }
  await act(async () => {
    signOutButton.click();
    await Promise.resolve();
  });
  expect(document.body.textContent).toContain("Sign in to Commandix");
});

test("failed sign-in restores controls and displays generic feedback", async () => {
  await renderSignedOut();
  mockRequests(() => jsonResponse({}, { status: 401 }));
  fillSignInForm();
  await submitForm();
  expect({
    message: document.body.textContent,
    tenantDisabled: getInput("tenant-slug").disabled,
    submitDisabled: getSubmitButton().disabled,
  }).toEqual({
    message: expect.stringContaining("We could not sign you in"),
    tenantDisabled: false,
    submitDisabled: false,
  });
});

test("accepts only known same-origin return destinations", () => {
  const validContract = "/contracts/8c3272ba-5192-4d55-817d-13f041850945";
  const validHistory = `${validContract}/history`;
  const validPage = "/?after=opaque-cursor";
  expect([
    validateReturnTo("/"),
    validateReturnTo(validPage),
    validateReturnTo(validContract),
    validateReturnTo(validHistory),
    validateReturnTo("https://example.com"),
    validateReturnTo("//example.com"),
    validateReturnTo("/contracts/not-a-uuid"),
    validateReturnTo("/unknown"),
    validateReturnTo("/?after=one&after=two"),
  ]).toEqual([
    "/",
    validPage,
    validContract,
    validHistory,
    "/",
    "/",
    "/",
    "/",
    "/",
  ]);
});

test("returns an authenticated deep link to its Contract detail", async () => {
  const contractId = "8c3272ba-5192-4d55-817d-13f041850945";
  await renderSignedOut(`/contracts/${contractId}`);
  mockRequests((url) => {
    if (url === API_ENDPOINTS.signIn)
      return jsonResponse({ accessToken: ACCESS_TOKEN });
    if (url === API_ENDPOINTS.identity)
      return jsonResponse(createIdentityFixture());
    if (url === API_ENDPOINTS.contractDetail(contractId)) {
      return jsonResponse({
        id: contractId,
        status: "DRAFT",
        revision: 1,
        values: { title: "Returned contract" },
        templateVersion: {
          id: "ed174ad1-3d85-49d1-84ed-9a6d14d4cc69",
          fields: [
            {
              key: "title",
              label: "Title",
              type: "text",
              required: true,
            },
          ],
        },
      });
    }
    return jsonResponse({}, { status: 404 });
  });
  fillSignInForm();
  await submitForm();
  await settle();

  expect(document.body.textContent).toContain("TitleReturned contract");
});

test("renders unknown application routes as a directed empty state", async () => {
  await renderSignedOut("/missing-page");

  expect(document.body.textContent).toContain(
    "This page is not in the workspace",
  );
});
