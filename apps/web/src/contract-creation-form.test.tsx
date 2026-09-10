import { expect, test } from "bun:test";
import { act } from "react";
import { render, submitForm } from "@/shared/test";
import {
  ContractCreationForm,
  type ContractCreationSession,
  serializeValues,
} from "./contract-creation-form";

const template = {
  templateVersionId: "version-id",
  fields: [
    { key: "title", label: "Title", type: "text" as const, required: true },
    { key: "note", label: "Note", type: "text" as const, required: false },
    {
      key: "amount",
      label: "Amount",
      type: "number" as const,
      required: false,
      default: 0,
    },
    { key: "date", label: "Date", type: "date" as const, required: true },
    {
      key: "approved",
      label: "Approved",
      type: "boolean" as const,
      required: false,
      default: false,
    },
    {
      key: "category",
      label: "Category",
      type: "enum" as const,
      required: true,
      options: ["standard", "premium"],
      default: "standard",
    },
  ],
};

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

test("renders typed controls with visible falsy defaults", async () => {
  const session = {
    requestJson: async () => template,
  } as ContractCreationSession;
  await render(<ContractCreationForm session={session} />);
  await settle();
  expect({
    controls: template.fields.map(
      (field) => document.getElementById(`contract-${field.key}`)?.tagName,
    ),
    amount: (document.getElementById("contract-amount") as HTMLInputElement)
      .value,
    approved: (
      document.getElementById("contract-approved") as HTMLSelectElement
    ).value,
  }).toStrictEqual({
    controls: ["INPUT", "INPUT", "INPUT", "INPUT", "SELECT", "SELECT"],
    amount: "0",
    approved: "false",
  });
});

test("submits typed values and resets after confirmation", async () => {
  let body: unknown;
  const session = {
    requestJson: async (_url: string, options: { init?: RequestInit }) => {
      if (!options.init) return template;
      body = JSON.parse(String(options.init.body));
      return {
        id: "contract-id",
        status: "DRAFT",
        revision: 1,
        templateVersionId: "version-id",
      };
    },
  } as ContractCreationSession;
  await render(<ContractCreationForm session={session} />);
  await settle();
  await submitForm();
  await settle();
  const serialized = serializeValues(template.fields, {
    title: { included: true, value: "Agreement" },
    note: { included: false, value: "" },
    amount: { included: true, value: "0" },
    date: { included: true, value: "2028-02-29" },
    approved: { included: true, value: "false" },
    category: { included: true, value: "standard" },
  });
  expect({
    body,
    serialized,
    message: document.body.textContent,
    reset: (document.getElementById("contract-title") as HTMLInputElement)
      .value,
  }).toStrictEqual({
    body: {
      values: { title: "", amount: 0, approved: false, category: "standard" },
    },
    serialized: {
      title: "Agreement",
      amount: 0,
      date: "2028-02-29",
      approved: false,
      category: "standard",
    },
    message: expect.stringContaining("Saved Draft contract-id, revision 1"),
    reset: "",
  });
});
