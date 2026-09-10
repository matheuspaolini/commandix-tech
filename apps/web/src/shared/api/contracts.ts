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

export type ContractRegisterItem = {
  id: string;
  status: ContractStatus;
  revision: number;
  createdAt: string;
};

export type ContractRegisterPage = {
  items: ContractRegisterItem[];
  nextCursor: string | null;
};

export type ResolvedHistorySnapshot = {
  status: ContractStatus;
  revision: number;
  values: ContractValues;
  templateVersion: { id: string; fields: TemplateField[] };
};

export type ContractHistory = {
  contract: { id: string; status: ContractStatus; revision: number };
  entries: Array<{
    id: string;
    action: string;
    revision: number;
    occurredAt: string;
    actor: { id: string; email: string };
    before: ResolvedHistorySnapshot | null;
    after: ResolvedHistorySnapshot;
  }>;
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

export function isContractRegisterPage(
  value: unknown,
): value is ContractRegisterPage {
  if (!isRecord(value) || !Array.isArray(value.items)) return false;
  return (
    (value.nextCursor === null || typeof value.nextCursor === "string") &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        isUuidV4(item.id) &&
        isContractStatus(item.status) &&
        isPositiveInteger(item.revision) &&
        isIsoInstant(item.createdAt),
    )
  );
}

export function isContractHistory(value: unknown): value is ContractHistory {
  if (
    !isRecord(value) ||
    !isRecord(value.contract) ||
    !Array.isArray(value.entries) ||
    typeof value.contract.id !== "string" ||
    !isUuidV4(value.contract.id) ||
    !isContractStatus(value.contract.status) ||
    !isPositiveInteger(value.contract.revision)
  )
    return false;

  let previousRevision = 0;
  return value.entries.every((entry) => {
    if (!isHistoryEntry(entry) || entry.revision <= previousRevision)
      return false;
    previousRevision = entry.revision;
    return true;
  });
}

function isHistoryEntry(
  value: unknown,
): value is ContractHistory["entries"][number] {
  if (!isRecord(value) || !isRecord(value.actor)) return false;
  return (
    typeof value.id === "string" &&
    isUuidV4(value.id) &&
    typeof value.action === "string" &&
    value.action.trim().length > 0 &&
    isPositiveInteger(value.revision) &&
    isIsoInstant(value.occurredAt) &&
    typeof value.actor.id === "string" &&
    isUuidV4(value.actor.id) &&
    typeof value.actor.email === "string" &&
    (value.before === null || isResolvedHistorySnapshot(value.before)) &&
    isResolvedHistorySnapshot(value.after)
  );
}

function isResolvedHistorySnapshot(
  value: unknown,
): value is ResolvedHistorySnapshot {
  return (
    isRecord(value) &&
    isContractStatus(value.status) &&
    isPositiveInteger(value.revision) &&
    isContractValues(value.values) &&
    isRecord(value.templateVersion) &&
    typeof value.templateVersion.id === "string" &&
    isUuidV4(value.templateVersion.id) &&
    Array.isArray(value.templateVersion.fields) &&
    value.templateVersion.fields.every(isTemplateField)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
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
