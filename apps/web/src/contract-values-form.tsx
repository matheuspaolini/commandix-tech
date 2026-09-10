import type { TemplateField, ContractValues } from "@/shared/api";

export type ContractValueInput = { included: boolean; value: string };
export type ContractValueFormState = Record<string, ContractValueInput>;
export type ContractValueIssue = { key?: string; code: string };
export type ContractValueFormSource =
  { kind: "defaults" } | { kind: "persisted"; values: ContractValues };

const ISSUE_MESSAGES: Record<string, string> = {
  NULL_NOT_ALLOWED: "Provide a value or omit this field.",
  REQUIRED: "This field is required.",
  INVALID_TYPE: "Enter a value of the expected type.",
  INVALID_TEXT: "Enter at least one non-space character.",
  INVALID_DATE: "Enter a valid calendar date.",
  INVALID_ENUM: "Choose one of the available options.",
  DUPLICATE_FIELD: "Clear this field only once.",
  AMBIGUOUS_FIELD: "Choose either a value or clearing this field.",
};

export function createContractValueForm(
  fields: TemplateField[],
  source: ContractValueFormSource,
): ContractValueFormState {
  return Object.fromEntries(
    fields.map((field) => {
      if (source.kind === "persisted") {
        const included = Object.hasOwn(source.values, field.key);
        const value = included
          ? String(source.values[field.key])
          : defaultValue(field);
        return [field.key, { included: field.required || included, value }];
      }
      const hasDefault = Object.hasOwn(field, "default");
      const included = hasDefault || field.required || field.type !== "text";
      return [field.key, { included, value: defaultValue(field) }];
    }),
  );
}

export function serializeContractValueForm(
  fields: TemplateField[],
  form: ContractValueFormState,
): { values: ContractValues; excludedOptionalKeys: string[] } {
  const values: ContractValues = {};
  const excludedOptionalKeys: string[] = [];
  for (const field of fields) {
    const input = form[field.key]!;
    if (!input.included || (input.value === "" && field.type !== "text")) {
      if (!field.required) excludedOptionalKeys.push(field.key);
      continue;
    }
    if (field.type === "number") values[field.key] = Number(input.value);
    else if (field.type === "boolean")
      values[field.key] = input.value === "true";
    else values[field.key] = input.value;
  }
  return { values, excludedOptionalKeys };
}

export function ContractValueFields({
  fields,
  form,
  issues,
  disabled,
  idPrefix,
  onChange,
}: {
  fields: TemplateField[];
  form: ContractValueFormState;
  issues: ContractValueIssue[];
  disabled: boolean;
  idPrefix: string;
  onChange: (key: string, change: Partial<ContractValueInput>) => void;
}) {
  const fieldIssues = new Map(
    issues
      .filter((issue) => issue.key)
      .map((issue) => [issue.key!, issue.code]),
  );
  return fields.map((field) => {
    const input = form[field.key]!;
    const inputId = `${idPrefix}-${field.key}`;
    const errorId = `${inputId}-error`;
    const error = fieldIssues.get(field.key);
    return (
      <div className="field" key={field.key}>
        {!field.required ? (
          <label className="include-value">
            <input
              type="checkbox"
              checked={input.included}
              disabled={disabled}
              onChange={(event) =>
                onChange(field.key, { included: event.target.checked })
              }
            />{" "}
            Include {field.label}
          </label>
        ) : null}
        <label htmlFor={inputId}>
          {field.label}
          {field.required ? " (required)" : ""}
        </label>
        {field.type === "enum" ? (
          <select
            id={inputId}
            value={input.included ? input.value : ""}
            disabled={disabled || !input.included}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) =>
              onChange(field.key, { value: event.target.value, included: true })
            }
          >
            <option value="">Select a value</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : field.type === "boolean" ? (
          <select
            id={inputId}
            value={input.included ? input.value : ""}
            disabled={disabled || !input.included}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) =>
              onChange(field.key, { value: event.target.value, included: true })
            }
          >
            <option value="">Select a value</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        ) : (
          <input
            id={inputId}
            type={
              field.type === "number"
                ? "number"
                : field.type === "date"
                  ? "date"
                  : "text"
            }
            value={input.value}
            disabled={disabled || !input.included}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) =>
              onChange(field.key, { value: event.target.value, included: true })
            }
          />
        )}
        {error ? (
          <p id={errorId} className="field-error" role="alert">
            {ISSUE_MESSAGES[error] ?? "Check this value."}
          </p>
        ) : null}
      </div>
    );
  });
}

function defaultValue(field: TemplateField): string {
  return Object.hasOwn(field, "default") ? String(field.default) : "";
}
