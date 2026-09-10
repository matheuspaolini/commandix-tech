import type {
  ContractStatus,
  ContractValues,
  TemplateField,
} from "@/shared/api";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function formatContractStatus(status: ContractStatus): string {
  return status[0] + status.slice(1).toLowerCase();
}

export function formatCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return value;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

export function formatContractValue(input: {
  field: TemplateField;
  values: ContractValues;
}): string {
  const { field, values } = input;
  if (!Object.hasOwn(values, field.key)) return "Not provided";
  const value = values[field.key]!;
  if (field.type === "text" && value === "") return "Empty text";
  if (field.type === "boolean" && typeof value === "boolean")
    return value ? "Yes" : "No";
  if (field.type === "date" && typeof value === "string")
    return formatCalendarDate(value);
  return String(value);
}

export function formatInstant(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatHistoryAction(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
