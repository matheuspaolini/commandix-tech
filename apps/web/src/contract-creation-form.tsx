import { type SubmitEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  API_ENDPOINTS,
  ApiResponseError,
  type AuthenticatedJsonOptions,
  isTemplateField,
  type TemplateField,
} from "@/shared/api";

type ActiveTemplate = { templateVersionId: string; fields: TemplateField[] };
type CreatedContract = {
  id: string;
  status: "DRAFT";
  revision: 1;
  templateVersionId: string;
};
type InputState = { included: boolean; value: string };
type FormState = Record<string, InputState>;
type Issue = { key?: string; code: string };
type LoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "failed" }
  | { status: "ready"; template: ActiveTemplate; form: FormState };
type CreationState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "failed"; issues: Issue[] }
  | { status: "saved"; contract: CreatedContract };

const ISSUE_MESSAGES: Record<string, string> = {
  NULL_NOT_ALLOWED: "Provide a value or omit this field.",
  REQUIRED: "This field is required.",
  INVALID_TYPE: "Enter a value of the expected type.",
  INVALID_TEXT: "Enter at least one non-space character.",
  INVALID_DATE: "Enter a valid calendar date.",
  INVALID_ENUM: "Choose one of the available options.",
};

export interface ContractCreationSession {
  requestJson<Value>(
    url: string,
    options: AuthenticatedJsonOptions<Value>,
  ): Promise<Value>;
}

export function ContractCreationForm({
  session,
}: {
  session: ContractCreationSession;
}) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [creation, setCreation] = useState<CreationState>({ status: "idle" });

  async function loadTemplate() {
    setLoad({ status: "loading" });
    try {
      const template = await session.requestJson(API_ENDPOINTS.activeTemplate, {
        isValid: isActiveTemplate,
      });
      setLoad({
        status: "ready",
        template,
        form: initialForm(template.fields),
      });
    } catch (error) {
      setLoad(
        error instanceof ApiResponseError && error.status === 404
          ? { status: "unavailable" }
          : { status: "failed" },
      );
    }
  }

  useEffect(() => {
    void loadTemplate();
  }, []);

  if (load.status === "loading")
    return (
      <section aria-busy="true">
        <p>Loading contract template…</p>
      </section>
    );
  if (load.status === "unavailable")
    return (
      <RetryState
        message="Contract creation is unavailable until an Admin configures a template."
        retry={loadTemplate}
      />
    );
  if (load.status === "failed")
    return (
      <RetryState
        message="We could not load the contract template."
        retry={loadTemplate}
      />
    );

  const pending = creation.status === "submitting";
  const fieldIssues =
    creation.status === "failed"
      ? new Map(
          creation.issues
            .filter((issue) => issue.key)
            .map((issue) => [issue.key!, issue.code]),
        )
      : new Map<string, string>();
  const formIssue =
    creation.status === "failed" &&
    creation.issues.some(
      (issue) => !issue.key || issue.code === "UNKNOWN_FIELD",
    );

  function update(key: string, change: Partial<InputState>) {
    setLoad((current) =>
      current.status === "ready"
        ? {
            ...current,
            form: {
              ...current.form,
              [key]: { ...current.form[key]!, ...change },
            },
          }
        : current,
    );
    setCreation({ status: "idle" });
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || load.status !== "ready") return;
    setCreation({ status: "submitting" });
    try {
      const contract = await session.requestJson(API_ENDPOINTS.contracts, {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            values: serializeValues(load.template.fields, load.form),
          }),
        },
        isValid: isCreatedContract,
      });
      setLoad({ ...load, form: initialForm(load.template.fields) });
      setCreation({ status: "saved", contract });
    } catch (error) {
      if (hasPublicCode(error, "ACTIVE_TEMPLATE_REQUIRED")) {
        setLoad({ status: "unavailable" });
        setCreation({ status: "idle" });
        return;
      }
      setCreation({ status: "failed", issues: validationIssues(error) });
    }
  }

  return (
    <section
      className="creation-card"
      aria-labelledby="create-contract-heading"
    >
      <h2 id="create-contract-heading">Create a Draft contract</h2>
      <form onSubmit={submit} noValidate>
        {load.template.fields.map((field) => {
          const input = load.form[field.key]!;
          const errorId = `contract-${field.key}-error`;
          const error = fieldIssues.get(field.key);
          return (
            <div className="field" key={field.key}>
              {field.type === "text" && !field.required ? (
                <label className="include-value">
                  <input
                    type="checkbox"
                    checked={input.included}
                    disabled={pending}
                    onChange={(event) =>
                      update(field.key, { included: event.target.checked })
                    }
                  />{" "}
                  Include {field.label}
                </label>
              ) : null}
              <label htmlFor={`contract-${field.key}`}>
                {field.label}
                {field.required ? " (required)" : ""}
              </label>
              {field.type === "enum" ? (
                <select
                  id={`contract-${field.key}`}
                  value={input.value}
                  disabled={pending}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(event) =>
                    update(field.key, {
                      value: event.target.value,
                      included: event.target.value !== "",
                    })
                  }
                >
                  <option value="">Not provided</option>
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.type === "boolean" ? (
                <select
                  id={`contract-${field.key}`}
                  value={input.value}
                  disabled={pending}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(event) =>
                    update(field.key, {
                      value: event.target.value,
                      included: event.target.value !== "",
                    })
                  }
                >
                  <option value="">Not provided</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  id={`contract-${field.key}`}
                  type={
                    field.type === "number"
                      ? "number"
                      : field.type === "date"
                        ? "date"
                        : "text"
                  }
                  value={input.value}
                  disabled={pending || !input.included}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(event) =>
                    update(field.key, {
                      value: event.target.value,
                      included: true,
                    })
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
        })}
        {formIssue ? (
          <p className="form-error" role="alert">
            The submitted contract contains unsupported values.
          </p>
        ) : null}
        {creation.status === "failed" && creation.issues.length === 0 ? (
          <p className="form-error" role="alert">
            We could not save the contract. Try again.
          </p>
        ) : null}
        <button type="submit" disabled={pending}>
          {pending ? "Saving Draft…" : "Create Draft"}
        </button>
      </form>
      {creation.status === "saved" ? (
        <p className="save-confirmation" role="status">
          Saved Draft {creation.contract.id}, revision{" "}
          {creation.contract.revision}.{" "}
          <Link to={`/contracts/${creation.contract.id}`}>
            View Draft contract
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function RetryState({
  message,
  retry,
}: {
  message: string;
  retry: () => Promise<void>;
}) {
  return (
    <section>
      <p role="alert">{message}</p>
      <button type="button" onClick={() => void retry()}>
        Retry
      </button>
    </section>
  );
}

function initialForm(fields: TemplateField[]): FormState {
  return Object.fromEntries(
    fields.map((field) => {
      const hasDefault = Object.hasOwn(field, "default");
      const included = hasDefault || field.required || field.type !== "text";
      return [
        field.key,
        { included, value: hasDefault ? String(field.default) : "" },
      ];
    }),
  );
}

export function serializeValues(fields: TemplateField[], form: FormState) {
  const values: Record<string, string | number | boolean> = {};
  for (const field of fields) {
    const input = form[field.key]!;
    if (!input.included || (input.value === "" && field.type !== "text"))
      continue;
    if (field.type === "number") values[field.key] = Number(input.value);
    else if (field.type === "boolean")
      values[field.key] = input.value === "true";
    else values[field.key] = input.value;
  }
  return values;
}

function validationIssues(error: unknown): Issue[] {
  if (!(error instanceof ApiResponseError) || !isRecord(error.body)) return [];
  return error.body.code === "INVALID_CONTRACT_VALUES" &&
    Array.isArray(error.body.issues)
    ? error.body.issues.filter(isIssue)
    : [];
}
function hasPublicCode(error: unknown, code: string): boolean {
  return (
    error instanceof ApiResponseError &&
    isRecord(error.body) &&
    error.body.code === code
  );
}
function isIssue(value: unknown): value is Issue {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    (value.key === undefined || typeof value.key === "string")
  );
}
function isActiveTemplate(value: unknown): value is ActiveTemplate {
  return (
    isRecord(value) &&
    typeof value.templateVersionId === "string" &&
    Array.isArray(value.fields) &&
    value.fields.every(isTemplateField)
  );
}
function isCreatedContract(value: unknown): value is CreatedContract {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.status === "DRAFT" &&
    value.revision === 1 &&
    typeof value.templateVersionId === "string"
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
