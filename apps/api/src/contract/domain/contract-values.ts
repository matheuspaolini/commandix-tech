import type {
  TemplateDefinition,
  TemplateField,
} from "@/contract/domain/template-definition";
import { isCalendarDate } from "@/contract/domain/template-definition";

export type ContractValue = string | number | boolean;
export type ContractValues = Record<string, ContractValue>;
export type ContractValueIssueCode =
  | "UNKNOWN_FIELD"
  | "NULL_NOT_ALLOWED"
  | "REQUIRED"
  | "INVALID_TYPE"
  | "INVALID_TEXT"
  | "INVALID_DATE"
  | "INVALID_ENUM"
  | "DUPLICATE_FIELD"
  | "AMBIGUOUS_FIELD";
export type ContractValueIssue = { key?: string; code: ContractValueIssueCode };

export class InvalidContractValues extends Error {
  constructor(readonly issues: ContractValueIssue[]) {
    super("Invalid contract values");
  }
}

export function canonicalContractValues(input: unknown): ContractValues {
  if (!isRecord(input))
    throw new InvalidContractValues([{ code: "INVALID_TYPE" }]);

  const values: ContractValues = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      typeof value !== "string" &&
      typeof value !== "boolean" &&
      !(typeof value === "number" && Number.isFinite(value))
    ) {
      throw new InvalidContractValues([{ key, code: "INVALID_TYPE" }]);
    }
    values[key] = canonicalNumber(value);
  }
  return values;
}

export function resolveContractValues(
  definition: TemplateDefinition,
  supplied: unknown,
): ContractValues {
  return resolveValues(definition, supplied, new Set());
}

export function resolveDraftEditValues(input: {
  definition: TemplateDefinition;
  supplied: unknown;
  clearedKeys: readonly string[];
}): ContractValues {
  if (!isRecord(input.supplied))
    throw new InvalidContractValues([{ code: "INVALID_TYPE" }]);

  const knownFields = new Map(
    input.definition.fields.map((field) => [field.key, field]),
  );
  const clearCounts = new Map<string, number>();
  for (const key of input.clearedKeys)
    clearCounts.set(key, (clearCounts.get(key) ?? 0) + 1);

  const issues: ContractValueIssue[] = [];
  for (const field of input.definition.fields) {
    const count = clearCounts.get(field.key) ?? 0;
    if (count === 0) continue;
    if (field.required) issues.push({ key: field.key, code: "REQUIRED" });
    if (count > 1) issues.push({ key: field.key, code: "DUPLICATE_FIELD" });
    if (Object.hasOwn(input.supplied, field.key))
      issues.push({ key: field.key, code: "AMBIGUOUS_FIELD" });
  }

  [...clearCounts.keys()]
    .filter((key) => !knownFields.has(key))
    .sort()
    .forEach((key) => {
      if (clearCounts.get(key)! > 1)
        issues.push({ key, code: "DUPLICATE_FIELD" });
      issues.push({ key, code: "UNKNOWN_FIELD" });
    });

  if (issues.length > 0) throw new InvalidContractValues(issues);
  return resolveValues(
    input.definition,
    input.supplied,
    new Set(input.clearedKeys),
  );
}

export function contractValuesEqual(
  left: ContractValues,
  right: ContractValues,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        Object.is(canonicalNumber(left[key]!), canonicalNumber(right[key]!)),
    )
  );
}

function resolveValues(
  definition: TemplateDefinition,
  supplied: unknown,
  clearedKeys: ReadonlySet<string>,
): ContractValues {
  if (!isRecord(supplied))
    throw new InvalidContractValues([{ code: "INVALID_TYPE" }]);

  const values: ContractValues = {};
  const issues: ContractValueIssue[] = [];
  const knownKeys = new Set(definition.fields.map((field) => field.key));

  for (const field of definition.fields) {
    if (clearedKeys.has(field.key)) continue;
    if (!Object.hasOwn(supplied, field.key)) {
      if (Object.hasOwn(field, "default"))
        values[field.key] = canonicalNumber(field.default!);
      else if (field.required)
        issues.push({ key: field.key, code: "REQUIRED" });
      continue;
    }

    const value = supplied[field.key];
    const issue = validateValue(field, value);
    if (issue) issues.push({ key: field.key, code: issue });
    else values[field.key] = canonicalNumber(value as ContractValue);
  }

  Object.keys(supplied)
    .filter((key) => !knownKeys.has(key))
    .sort()
    .forEach((key) => issues.push({ key, code: "UNKNOWN_FIELD" }));

  if (issues.length > 0) throw new InvalidContractValues(issues);
  return values;
}

function validateValue(
  field: TemplateField,
  value: unknown,
): ContractValueIssueCode | null {
  if (value === null) return "NULL_NOT_ALLOWED";
  if (field.type === "text") {
    if (typeof value !== "string") return "INVALID_TYPE";
    return field.required && !/\S/u.test(value) ? "INVALID_TEXT" : null;
  }
  if (field.type === "number")
    return typeof value === "number" && Number.isFinite(value)
      ? null
      : "INVALID_TYPE";
  if (field.type === "date") {
    if (typeof value !== "string") return "INVALID_TYPE";
    return isCalendarDate(value) ? null : "INVALID_DATE";
  }
  if (field.type === "boolean")
    return typeof value === "boolean" ? null : "INVALID_TYPE";
  if (typeof value !== "string") return "INVALID_TYPE";
  return field.options.includes(value) ? null : "INVALID_ENUM";
}

function canonicalNumber(value: ContractValue): ContractValue {
  return typeof value === "number" && Object.is(value, -0) ? 0 : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
