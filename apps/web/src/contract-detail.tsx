import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import {
  API_ENDPOINTS,
  ApiResponseError,
  type AuthenticatedJsonOptions,
  type ContractDetail,
  type ContractStatus,
  type ContractValues,
  isContractDetail,
  isUuidV4,
  type TemplateField,
} from "@/shared/api";

type ContractDetailState =
  | { status: "loading" }
  | { status: "ready"; contract: ContractDetail }
  | { status: "notFound" }
  | { status: "failed" };

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

export interface ContractDetailSession {
  requestJson<Value>(
    url: string,
    options: AuthenticatedJsonOptions<Value>,
  ): Promise<Value>;
}

export function ContractDetailPage({
  session,
  onAuthenticationLost,
}: {
  session: ContractDetailSession;
  onAuthenticationLost: () => void;
}) {
  const { contractId = "" } = useParams();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<ContractDetailState>({
    status: "loading",
  });

  useEffect(() => {
    if (!isUuidV4(contractId)) {
      setState({ status: "notFound" });
      return;
    }

    let active = true;
    setState({ status: "loading" });
    void session
      .requestJson(API_ENDPOINTS.contractDetail(contractId), {
        isValid: isContractDetail,
      })
      .then((contract) => {
        if (active) setState({ status: "ready", contract });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiResponseError && error.status === 401) {
          onAuthenticationLost();
          return;
        }
        setState(
          error instanceof ApiResponseError && error.status === 404
            ? { status: "notFound" }
            : { status: "failed" },
        );
      });

    return () => {
      active = false;
    };
  }, [contractId, onAuthenticationLost, retry, session]);

  if (state.status === "loading") {
    return (
      <main aria-busy="true" className="detail-main">
        <p>Opening contract…</p>
      </main>
    );
  }
  if (state.status === "notFound") return <ContractNotFound />;
  if (state.status === "failed") {
    return (
      <main className="empty-main">
        <section className="empty-state" aria-labelledby="detail-error-heading">
          <p className="empty-state-mark" aria-hidden="true">
            !
          </p>
          <h1 id="detail-error-heading">The contract could not be opened</h1>
          <p>
            The request did not complete. Check your connection and try again.
          </p>
          <div className="empty-actions">
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
            <Link className="button-link secondary-link" to="/">
              Back to home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const contract = state.contract;
  const status = formatContractStatus(contract.status);
  return (
    <main className="detail-main">
      <article className="contract-sheet" aria-labelledby="contract-heading">
        <header className="contract-heading">
          <div>
            <p className="document-kicker">Saved contract</p>
            <h1 id="contract-heading">{status} contract</h1>
          </div>
          <span
            className={`status-badge status-${contract.status.toLowerCase()}`}
          >
            {status}
          </span>
        </header>

        <dl className="contract-metadata">
          <Metadata label="Contract ID" value={contract.id} />
          <Metadata label="Revision" value={String(contract.revision)} />
          <Metadata
            label="Template version"
            value={contract.templateVersion.id}
          />
        </dl>

        <section
          className="contract-fields"
          aria-labelledby="contract-fields-heading"
        >
          <h2 id="contract-fields-heading">Contract details</h2>
          <dl>
            {contract.templateVersion.fields.map((field) => (
              <div className="contract-field" key={field.key}>
                <dt>{field.label}</dt>
                <dd>
                  {formatContractValue({ field, values: contract.values })}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <Link className="text-link" to="/">
          Back to home
        </Link>
      </article>
    </main>
  );
}

export function RouteNotFoundPage() {
  return (
    <main className="empty-main">
      <section
        className="empty-state"
        aria-labelledby="route-not-found-heading"
      >
        <p className="empty-state-mark" aria-hidden="true">
          404
        </p>
        <h1 id="route-not-found-heading">This page is not in the workspace</h1>
        <p>The address may be incomplete or the page may have moved.</p>
        <Link className="button-link" to="/">
          Back to home
        </Link>
      </section>
    </main>
  );
}

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

function ContractNotFound() {
  return (
    <main className="empty-main">
      <section
        className="empty-state"
        aria-labelledby="contract-not-found-heading"
      >
        <p className="empty-state-mark" aria-hidden="true">
          —
        </p>
        <h1 id="contract-not-found-heading">Contract not found</h1>
        <p>
          This contract does not exist, or it is not available in your
          workspace.
        </p>
        <Link className="button-link" to="/">
          Back to home
        </Link>
      </section>
    </main>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
