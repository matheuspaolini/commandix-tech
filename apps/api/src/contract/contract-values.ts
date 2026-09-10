import type { TemplateDefinition, TemplateField } from "./template-definition";
import { isCalendarDate } from "./template-definition";

export type ContractValue = string | number | boolean;
export type ContractValues = Record<string, ContractValue>;
export type ContractValueIssueCode =
  | "UNKNOWN_FIELD"
  | "NULL_NOT_ALLOWED"
  | "REQUIRED"
  | "INVALID_TYPE"
  | "INVALID_TEXT"
  | "INVALID_DATE"
  | "INVALID_ENUM";
export type ContractValueIssue = { key?: string; code: ContractValueIssueCode };

export class InvalidContractValues extends Error {
  constructor(readonly issues: ContractValueIssue[]) {
    super("Invalid contract values");
  }
}

export function resolveContractValues(
  definition: TemplateDefinition,
  supplied: unknown,
): ContractValues {
  if (!isRecord(supplied))
    throw new InvalidContractValues([{ code: "INVALID_TYPE" }]);

  const values: ContractValues = {};
  const issues: ContractValueIssue[] = [];
  const knownKeys = new Set(definition.fields.map((field) => field.key));

  for (const field of definition.fields) {
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
