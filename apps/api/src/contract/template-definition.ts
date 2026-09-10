export type FieldKey = string;

type FieldBase = {
  key: FieldKey;
  label: string;
  required: boolean;
};

export type TextField = FieldBase & { type: "text"; default?: string };
export type NumberField = FieldBase & { type: "number"; default?: number };
export type DateField = FieldBase & { type: "date"; default?: string };
export type BooleanField = FieldBase & {
  type: "boolean";
  default?: boolean;
};
export type EnumField = FieldBase & {
  type: "enum";
  options: string[];
  default?: string;
};

export type TemplateField =
  TextField | NumberField | DateField | BooleanField | EnumField;

export type TemplateDefinition = { fields: TemplateField[] };

export class InvalidTemplateDefinition extends Error {}

const FIELD_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FIELD_TYPES = ["text", "number", "date", "boolean", "enum"] as const;
const MIN_ITEMS = 1;
const MAX_ITEMS = 100;
const MAX_KEY_LENGTH = 63;
const MAX_DISPLAY_LENGTH = 120;
const COMMON_PROPERTIES = ["key", "label", "type", "required", "default"];

export function canonicalTemplateDefinition(
  input: unknown,
): TemplateDefinition {
  if (!isRecordWithOnly(input, ["fields"]) || !Array.isArray(input.fields))
    throw new InvalidTemplateDefinition();
  if (input.fields.length < MIN_ITEMS || input.fields.length > MAX_ITEMS)
    throw new InvalidTemplateDefinition();

  const keys = new Set<string>();
  const fields = input.fields.map((value) => {
    const field = canonicalField(value);
    if (keys.has(field.key)) throw new InvalidTemplateDefinition();
    keys.add(field.key);
    return field;
  });

  return { fields };
}

export function templateDefinitionsEqual(
  left: TemplateDefinition,
  right: TemplateDefinition,
): boolean {
  return (
    JSON.stringify(semanticDefinition(left)) ===
    JSON.stringify(semanticDefinition(right))
  );
}

function canonicalField(value: unknown): TemplateField {
  if (!isRecord(value)) throw new InvalidTemplateDefinition();
  if (typeof value.type !== "string" || !isFieldType(value.type))
    throw new InvalidTemplateDefinition();
  const permittedProperties =
    value.type === "enum"
      ? [...COMMON_PROPERTIES, "options"]
      : COMMON_PROPERTIES;
  if (!hasOnlyProperties(value, permittedProperties))
    throw new InvalidTemplateDefinition();

  const base = canonicalFieldBase(value);
  const hasDefault = Object.hasOwn(value, "default");

  if (value.type === "enum") {
    const options = canonicalOptions(value.options);
    const field: EnumField = { ...base, type: "enum", options };
    if (hasDefault)
      field.default = canonicalDefault(
        "enum",
        value.default,
        base.required,
        options,
      );
    return field;
  }

  if (value.type === "text") {
    const field: TextField = { ...base, type: "text" };
    if (hasDefault)
      field.default = canonicalDefault("text", value.default, base.required);
    return field;
  }
  if (value.type === "number") {
    const field: NumberField = { ...base, type: "number" };
    if (hasDefault)
      field.default = canonicalDefault("number", value.default, base.required);
    return field;
  }
  if (value.type === "date") {
    const field: DateField = { ...base, type: "date" };
    if (hasDefault)
      field.default = canonicalDefault("date", value.default, base.required);
    return field;
  }

  const field: BooleanField = { ...base, type: "boolean" };
  if (hasDefault)
    field.default = canonicalDefault("boolean", value.default, base.required);
  return field;
}

function canonicalFieldBase(value: Record<string, unknown>): FieldBase {
  if (
    typeof value.key !== "string" ||
    codePointLength(value.key) > MAX_KEY_LENGTH ||
    !FIELD_KEY.test(value.key) ||
    typeof value.label !== "string" ||
    typeof value.required !== "boolean"
  ) {
    throw new InvalidTemplateDefinition();
  }
  const label = value.label.trim();
  if (!label || codePointLength(label) > MAX_DISPLAY_LENGTH)
    throw new InvalidTemplateDefinition();
  return { key: value.key, label, required: value.required };
}

function canonicalOptions(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length < MIN_ITEMS ||
    value.length > MAX_ITEMS
  )
    throw new InvalidTemplateDefinition();
  const options = value.map((option) => canonicalDisplayValue(option));
  if (new Set(options).size !== options.length)
    throw new InvalidTemplateDefinition();
  return options;
}

function canonicalDisplayValue(value: unknown): string {
  if (typeof value !== "string") throw new InvalidTemplateDefinition();
  const canonical = value.trim();
  if (!canonical || codePointLength(canonical) > MAX_DISPLAY_LENGTH)
    throw new InvalidTemplateDefinition();
  return canonical;
}

function canonicalDefault(
  type: "text",
  value: unknown,
  required: boolean,
): string;
function canonicalDefault(
  type: "number",
  value: unknown,
  required: boolean,
): number;
function canonicalDefault(
  type: "date",
  value: unknown,
  required: boolean,
): string;
function canonicalDefault(
  type: "boolean",
  value: unknown,
  required: boolean,
): boolean;
function canonicalDefault(
  type: "enum",
  value: unknown,
  required: boolean,
  options: string[],
): string;
function canonicalDefault(
  type: TemplateField["type"],
  value: unknown,
  required: boolean,
  options: string[] = [],
): string | number | boolean {
  if (type === "text") {
    if (typeof value !== "string" || (required && !/\S/u.test(value)))
      throw new InvalidTemplateDefinition();
    return value;
  }
  if (type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new InvalidTemplateDefinition();
    return Object.is(value, -0) ? 0 : value;
  }
  if (type === "date") {
    if (typeof value !== "string" || !isCalendarDate(value))
      throw new InvalidTemplateDefinition();
    return value;
  }
  if (type === "boolean") {
    if (typeof value !== "boolean") throw new InvalidTemplateDefinition();
    return value;
  }
  if (typeof value !== "string" || !options.includes(value))
    throw new InvalidTemplateDefinition();
  return value;
}

export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function semanticDefinition(definition: TemplateDefinition) {
  return {
    fields: definition.fields
      .map((field) => ({
        ...field,
        ...(field.type === "enum"
          ? { options: [...field.options].sort() }
          : {}),
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function isFieldType(value: string): value is TemplateField["type"] {
  return FIELD_TYPES.some((type) => type === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordWithOnly(
  value: unknown,
  properties: readonly string[],
): value is Record<string, unknown> {
  return isRecord(value) && hasOnlyProperties(value, properties);
}

function hasOnlyProperties(
  value: Record<string, unknown>,
  properties: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length ===
      properties.filter((property) => Object.hasOwn(value, property)).length &&
    actual.every((property) => properties.includes(property))
  );
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}
