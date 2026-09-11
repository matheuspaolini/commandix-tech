import { describe, expect, test } from "bun:test";

import {
  canonicalTemplateDefinition,
  InvalidTemplateDefinition,
  templateDefinitionsEqual,
} from "@/contract/domain/template-definition";

const VALID_FIELDS = [
  { key: "title", label: " Title ", type: "text", required: true },
  {
    key: "amount",
    label: "Amount",
    type: "number",
    required: false,
    default: -0,
  },
  {
    key: "effective-date",
    label: "Effective date",
    type: "date",
    required: true,
    default: "2026-09-10",
  },
  {
    key: "approved",
    label: "Approved",
    type: "boolean",
    required: false,
    default: false,
  },
  {
    key: "category",
    label: "Category",
    type: "enum",
    required: true,
    options: [" standard ", "premium"],
    default: "standard",
  },
] as const;

const invalidDefinitions = [
  ["an empty template", { fields: [] }],
  [
    "more than 100 fields",
    {
      fields: Array.from({ length: 101 }, (_, index) => ({
        ...VALID_FIELDS[0],
        key: `field-${index}`,
      })),
    },
  ],
  ["an unknown root property", { fields: [VALID_FIELDS[0]], extra: true }],
  [
    "a duplicate key",
    { fields: [VALID_FIELDS[0], { ...VALID_FIELDS[0], label: "Other" }] },
  ],
  ["a padded key", { fields: [{ ...VALID_FIELDS[0], key: " title" }] }],
  [
    "a key longer than 63 characters",
    { fields: [{ ...VALID_FIELDS[0], key: "a".repeat(64) }] },
  ],
  ["a blank label", { fields: [{ ...VALID_FIELDS[0], label: "  " }] }],
  [
    "a label longer than 120 code points",
    { fields: [{ ...VALID_FIELDS[0], label: "a".repeat(121) }] },
  ],
  [
    "options on a non-enum field",
    { fields: [{ ...VALID_FIELDS[0], options: ["unused"] }] },
  ],
  [
    "an enum without options",
    { fields: [{ ...VALID_FIELDS[4], options: [] }] },
  ],
  [
    "more than 100 enum options",
    {
      fields: [
        {
          ...VALID_FIELDS[4],
          options: Array.from({ length: 101 }, (_, index) => `option-${index}`),
        },
      ],
    },
  ],
  [
    "an enum option longer than 120 code points",
    { fields: [{ ...VALID_FIELDS[4], options: ["a".repeat(121)] }] },
  ],
  [
    "duplicate canonical enum options",
    { fields: [{ ...VALID_FIELDS[4], options: ["standard", " standard "] }] },
  ],
  [
    "an invalid calendar date default",
    { fields: [{ ...VALID_FIELDS[2], default: "2026-02-29" }] },
  ],
  [
    "a non-finite number default",
    { fields: [{ ...VALID_FIELDS[1], default: Number.POSITIVE_INFINITY }] },
  ],
  [
    "a blank required text default",
    { fields: [{ ...VALID_FIELDS[0], default: "  " }] },
  ],
  ["a null default", { fields: [{ ...VALID_FIELDS[0], default: null }] }],
] as const;

describe("canonicalTemplateDefinition", () => {
  test("canonicalizes all five field types without mutating their order", () => {
    expect(canonicalTemplateDefinition({ fields: VALID_FIELDS })).toStrictEqual(
      {
        fields: [
          { key: "title", label: "Title", type: "text", required: true },
          {
            key: "amount",
            label: "Amount",
            type: "number",
            required: false,
            default: 0,
          },
          {
            key: "effective-date",
            label: "Effective date",
            type: "date",
            required: true,
            default: "2026-09-10",
          },
          {
            key: "approved",
            label: "Approved",
            type: "boolean",
            required: false,
            default: false,
          },
          {
            key: "category",
            label: "Category",
            type: "enum",
            required: true,
            options: ["standard", "premium"],
            default: "standard",
          },
        ],
      },
    );
  });

  for (const [scenario, definition] of invalidDefinitions) {
    test(`rejects ${scenario}`, () => {
      expect(() => canonicalTemplateDefinition(definition)).toThrow(
        InvalidTemplateDefinition,
      );
    });
  }
});

describe("templateDefinitionsEqual", () => {
  test("ignores field and enum option order", () => {
    const left = canonicalTemplateDefinition({ fields: VALID_FIELDS });
    const right = canonicalTemplateDefinition({
      fields: [
        { ...VALID_FIELDS[4], options: ["premium", "standard"] },
        ...VALID_FIELDS.slice(0, 4).reverse(),
      ],
    });

    expect(templateDefinitionsEqual(left, right)).toBe(true);
  });

  test("distinguishes an omitted default from an explicit default", () => {
    const left = canonicalTemplateDefinition({ fields: [VALID_FIELDS[0]] });
    const right = canonicalTemplateDefinition({
      fields: [{ ...VALID_FIELDS[0], default: "Contract" }],
    });

    expect(templateDefinitionsEqual(left, right)).toBe(false);
  });
});
