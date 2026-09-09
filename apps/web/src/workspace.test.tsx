import { beforeEach, expect, spyOn, test } from "bun:test";

import { API_ENDPOINTS } from "@/shared/api";
import {
  ACCESS_TOKEN,
  fetchImplementation,
  getInput,
  getSubmitButton,
  jsonResponse,
  mockSuccessfulSignIn,
  render,
  type RequestRecord,
  setInputValue,
  SIGN_IN_FORM,
  submitForm,
} from "@/shared/test";

import { Workspace } from "./workspace";

beforeEach(async () => {
  await render(<Workspace />);
});

function fillSignInForm() {
  setInputValue("tenant-slug", SIGN_IN_FORM.slug);
  setInputValue("email", SIGN_IN_FORM.email);
  setInputValue("password", SIGN_IN_FORM.password);
}

async function completeSignIn() {
  fillSignInForm();
  await submitForm();
}

test("sign-in controls have accessible labels", () => {
  const labelCounts = ["tenant-slug", "email", "password"].map(
    (id) => getInput(id).labels?.length,
  );

  expect(labelCounts).toEqual([1, 1, 1]);
});

test("successful sign-in displays the tenant workspace", async () => {
  mockSuccessfulSignIn();

  await completeSignIn();

  expect(document.body.textContent).toContain("You are signed in");
});

test("sign-in forwards the access token to the identity request", async () => {
  const requests: RequestRecord[] = [];
  mockSuccessfulSignIn(requests);

  await completeSignIn();

  expect(requests).toEqual([
    { url: API_ENDPOINTS.signIn, authorization: undefined },
    {
      url: API_ENDPOINTS.identity,
      authorization: `Bearer ${ACCESS_TOKEN}`,
    },
  ]);
});

test("sign-in does not persist the access token", async () => {
  const rejectPersistence = () => {
    throw new Error("Access tokens must not be persisted");
  };
  spyOn(window.localStorage, "setItem").mockImplementation(rejectPersistence);
  spyOn(window.sessionStorage, "setItem").mockImplementation(rejectPersistence);
  mockSuccessfulSignIn();

  await completeSignIn();

  expect(document.body.textContent).toContain("You are signed in");
});

test("failed sign-in restores controls and displays generic feedback", async () => {
  spyOn(globalThis, "fetch").mockImplementation(
    fetchImplementation(async () => jsonResponse({}, { status: 401 })),
  );

  await completeSignIn();

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
