import { type SubmitEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  API_ENDPOINTS,
  ApiResponseError,
  type AuthenticatedJsonOptions,
  isTemplateField,
  type TemplateField,
} from "@/shared/api";
import {
  ContractValueFields,
  createContractValueForm,
  serializeContractValueForm,
  type ContractValueInput,
  type ContractValueFormState,
  type ContractValueIssue,
} from "./contract-values-form";

type ActiveTemplate = { templateVersionId: string; fields: TemplateField[] };
type CreatedContract = {
  id: string;
  status: "DRAFT";
  revision: 1;
  templateVersionId: string;
};
type LoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "failed" }
  | { status: "ready"; template: ActiveTemplate; form: ContractValueFormState };
type CreationState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "failed"; issues: ContractValueIssue[] }
  | { status: "saved"; contract: CreatedContract };

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
        form: createContractValueForm(template.fields, { kind: "defaults" }),
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
  const formIssue =
    creation.status === "failed" &&
    creation.issues.some(
      (issue) => !issue.key || issue.code === "UNKNOWN_FIELD",
    );

  function update(key: string, change: Partial<ContractValueInput>) {
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
            values: serializeContractValueForm(load.template.fields, load.form)
              .values,
          }),
        },
        isValid: isCreatedContract,
      });
      setLoad({
        ...load,
        form: createContractValueForm(load.template.fields, {
          kind: "defaults",
        }),
      });
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
        <ContractValueFields
          fields={load.template.fields}
          form={load.form}
          issues={creation.status === "failed" ? creation.issues : []}
          disabled={pending}
          idPrefix="contract"
          onChange={update}
        />
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

function validationIssues(error: unknown): ContractValueIssue[] {
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
function isIssue(value: unknown): value is ContractValueIssue {
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
