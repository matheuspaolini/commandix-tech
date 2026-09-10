export type ContractValue = string | number | boolean;
export type ContractValues = Record<string, ContractValue>;
export type ContractStatus = "DRAFT" | "ACTIVE" | "CLOSED";

type FieldBase = { key: string; label: string; required: boolean };

export type TemplateField =
  | (FieldBase & { type: "text"; default?: string })
  | (FieldBase & { type: "number"; default?: number })
  | (FieldBase & { type: "date"; default?: string })
  | (FieldBase & { type: "boolean"; default?: boolean })
  | (FieldBase & {
      type: "enum";
      options: string[];
      default?: string;
    });

export type ContractDetail = {
  id: string;
  status: ContractStatus;
  revision: number;
  values: ContractValues;
  templateVersion: { id: string; fields: TemplateField[] };
};

export function isTemplateField(value: unknown): value is TemplateField {
  if (!isRecord(value)) return false;
  if (
    typeof value.key !== "string" ||
    typeof value.label !== "string" ||
    typeof value.required !== "boolean" ||
    !isFieldType(value.type)
  )
    return false;

  if (value.type === "enum") {
    return (
      Array.isArray(value.options) &&
      value.options.every((option) => typeof option === "string") &&
      (!Object.hasOwn(value, "default") || typeof value.default === "string")
    );
  }
  if (Object.hasOwn(value, "options")) return false;
  if (!Object.hasOwn(value, "default")) return true;
  if (value.type === "number") return typeof value.default === "number";
  if (value.type === "boolean") return typeof value.default === "boolean";
  return typeof value.default === "string";
}

export function isContractDetail(value: unknown): value is ContractDetail {
  if (!isRecord(value) || !isRecord(value.templateVersion)) return false;
  return (
    typeof value.id === "string" &&
    isUuidV4(value.id) &&
    isContractStatus(value.status) &&
    Number.isInteger(value.revision) &&
    (value.revision as number) > 0 &&
    isContractValues(value.values) &&
    typeof value.templateVersion.id === "string" &&
    isUuidV4(value.templateVersion.id) &&
    Array.isArray(value.templateVersion.fields) &&
    value.templateVersion.fields.every(isTemplateField)
  );
}

export function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function isContractValues(value: unknown): value is ContractValues {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (item) =>
        typeof item === "string" ||
        typeof item === "boolean" ||
        (typeof item === "number" && Number.isFinite(item)),
    )
  );
}

function isContractStatus(value: unknown): value is ContractStatus {
  return value === "DRAFT" || value === "ACTIVE" || value === "CLOSED";
}

function isFieldType(value: unknown): value is TemplateField["type"] {
  return ["text", "number", "date", "boolean", "enum"].includes(
    value as string,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
