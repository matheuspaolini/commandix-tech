import { describe, expect, test } from "bun:test";
import {
  contractValuesEqual,
  type ContractValueIssue,
  InvalidContractValues,
  resolveDraftEditValues,
  resolveContractValues,
} from "@/modules/contract/domain/contract-values";
import type { TemplateDefinition } from "@/modules/contract/domain/template-definition";

const definition: TemplateDefinition = {
  fields: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "note", label: "Note", type: "text", required: false },
    {
      key: "amount",
      label: "Amount",
      type: "number",
      required: false,
      default: 0,
    },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "approved", label: "Approved", type: "boolean", required: true },
    {
      key: "region",
      label: "Region",
      type: "enum",
      required: true,
      options: ["North", "South"],
    },
  ],
};

function issuesFor(values: unknown) {
  try {
    resolveContractValues(definition, values);
    return [];
  } catch (error) {
    if (!(error instanceof InvalidContractValues)) throw error;
    return error.issues;
  }
}

test("resolves all field types while preserving falsy values and defaults", () => {
  expect(
    resolveContractValues(definition, {
      title: "Agreement",
      note: "",
      date: "2028-02-29",
      approved: false,
      region: "South",
    }),
  ).toStrictEqual({
    title: "Agreement",
    note: "",
    amount: 0,
    date: "2028-02-29",
    approved: false,
    region: "South",
  });
});

test("keeps optional fields without defaults absent", () => {
  expect(
    resolveContractValues(definition, {
      title: "Agreement",
      date: "2027-01-01",
      approved: true,
      region: "North",
    }),
  ).toStrictEqual({
    title: "Agreement",
    amount: 0,
    date: "2027-01-01",
    approved: true,
    region: "North",
  });
});

test("canonicalizes an explicitly supplied negative zero", () => {
  expect(
    resolveContractValues(definition, {
      title: "Agreement",
      amount: -0,
      date: "2024-02-29",
      approved: true,
      region: "North",
    }).amount,
  ).toBe(0);
});

test("orders definition issues before lexically ordered unknown keys", () => {
  expect(
    issuesFor({
      title: "   ",
      date: "2027-02-29",
      approved: 0,
      region: "north",
      zebra: 1,
      alpha: 2,
    }),
  ).toStrictEqual([
    { key: "title", code: "INVALID_TEXT" },
    { key: "date", code: "INVALID_DATE" },
    { key: "approved", code: "INVALID_TYPE" },
    { key: "region", code: "INVALID_ENUM" },
    { key: "alpha", code: "UNKNOWN_FIELD" },
    { key: "zebra", code: "UNKNOWN_FIELD" },
  ]);
});

describe("invalid contract values", () => {
  const cases: [string, unknown, ContractValueIssue[]][] = [
    ["non-object", null, [{ code: "INVALID_TYPE" }]],
    [
      "explicit null",
      { title: null, date: "2024-01-01", approved: true, region: "North" },
      [{ key: "title", code: "NULL_NOT_ALLOWED" }],
    ],
    [
      "missing required",
      {},
      [
        { key: "title", code: "REQUIRED" },
        { key: "date", code: "REQUIRED" },
        { key: "approved", code: "REQUIRED" },
        { key: "region", code: "REQUIRED" },
      ],
    ],
    [
      "date timestamp",
      {
        title: "A",
        date: "2024-01-01T00:00:00Z",
        approved: true,
        region: "North",
      },
      [{ key: "date", code: "INVALID_DATE" }],
    ],
    [
      "wrong JSON types",
      {
        title: 1,
        amount: "1",
        date: 20270101,
        approved: "false",
        region: false,
      },
      [
        { key: "title", code: "INVALID_TYPE" },
        { key: "amount", code: "INVALID_TYPE" },
        { key: "date", code: "INVALID_TYPE" },
        { key: "approved", code: "INVALID_TYPE" },
        { key: "region", code: "INVALID_TYPE" },
      ],
    ],
  ];
  for (const [name, values, expected] of cases)
    test(name, () => expect(issuesFor(values)).toStrictEqual(expected));
});

test("resolves complete Draft edits with defaults and explicit clearing", () => {
  expect(
    resolveDraftEditValues({
      definition: {
        fields: [
          {
            key: "amount",
            label: "Amount",
            type: "number",
            required: false,
            default: 100,
          },
          {
            key: "notes",
            label: "Notes",
            type: "text",
            required: false,
          },
        ],
      },
      supplied: {},
      clearedKeys: ["amount"],
    }),
  ).toStrictEqual({});
});

test("rejects ambiguous, duplicate, required, and unknown Draft clears deterministically", () => {
  const editDefinition: TemplateDefinition = {
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "notes", label: "Notes", type: "text", required: false },
    ],
  };
  let issues: ContractValueIssue[] = [];
  try {
    resolveDraftEditValues({
      definition: editDefinition,
      supplied: { notes: "kept" },
      clearedKeys: ["title", "notes", "notes", "missing"],
    });
  } catch (error) {
    if (!(error instanceof InvalidContractValues)) throw error;
    issues = error.issues;
  }

  expect(issues).toStrictEqual([
    { key: "title", code: "REQUIRED" },
    { key: "notes", code: "DUPLICATE_FIELD" },
    { key: "notes", code: "AMBIGUOUS_FIELD" },
    { key: "missing", code: "UNKNOWN_FIELD" },
  ]);
});

test("compares canonical Contract values independently of property order", () => {
  expect({
    reordered: contractValuesEqual(
      { amount: 0, approved: false },
      { approved: false, amount: -0 },
    ),
    missing: contractValuesEqual({ notes: "" }, {}),
  }).toStrictEqual({ reordered: true, missing: false });
});
