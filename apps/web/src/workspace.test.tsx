import { expect, spyOn, test } from "bun:test";
import { act } from "react";

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

import { Workspace } from "./workspace";

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

async function renderSignedOut() {
  mockRequests(() => jsonResponse({}, { status: 401 }));
  await render(<Workspace />);
  await settle();
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
  await render(<Workspace />);
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
