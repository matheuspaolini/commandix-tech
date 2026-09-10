import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import {
  API_ENDPOINTS,
  ApiResponseError,
  type AuthenticatedJsonOptions,
  type ContractHistory,
  isContractHistory,
  isUuidV4,
  type ResolvedHistorySnapshot,
} from "@/shared/api";
import {
  formatContractStatus,
  formatContractValue,
  formatHistoryAction,
  formatInstant,
} from "./contract-presentation";

export interface ContractHistorySession {
  requestJson<Value>(
    url: string,
    options: AuthenticatedJsonOptions<Value>,
  ): Promise<Value>;
}

type HistoryState =
  | { status: "loading" }
  | { status: "ready"; history: ContractHistory }
  | { status: "notFound" }
  | { status: "failed" };

export function ContractHistoryPage({
  session,
  onAuthenticationLost,
}: {
  session: ContractHistorySession;
  onAuthenticationLost: () => void;
}) {
  const { contractId = "" } = useParams();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<HistoryState>({ status: "loading" });

  useEffect(() => {
    if (!isUuidV4(contractId)) {
      setState({ status: "notFound" });
      return;
    }
    let active = true;
    setState({ status: "loading" });
    void session
      .requestJson(API_ENDPOINTS.contractHistory(contractId), {
        isValid: isContractHistory,
      })
      .then((history) => active && setState({ status: "ready", history }))
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

  if (state.status === "loading")
    return (
      <main className="history-main" aria-busy="true">
        <p>Opening contract history…</p>
      </main>
    );
  if (state.status === "notFound") return <HistoryNotFound />;
  if (state.status === "failed")
    return (
      <main className="empty-main">
        <section
          className="empty-state"
          aria-labelledby="history-error-heading"
        >
          <p className="empty-state-mark" aria-hidden="true">
            !
          </p>
          <h1 id="history-error-heading">The history could not be opened</h1>
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
              Back to register
            </Link>
          </div>
        </section>
      </main>
    );

  const { contract, entries } = state.history;
  return (
    <main className="history-main">
      <header className="history-heading">
        <div>
          <p className="document-kicker">Immutable audit history</p>
          <h1>Contract history</h1>
          <code>{contract.id}</code>
        </div>
        <span
          className={`status-badge status-${contract.status.toLowerCase()}`}
        >
          {formatContractStatus(contract.status)} · Revision {contract.revision}
        </span>
      </header>
      <section className="history-section" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading">Change timeline</h2>
        <ol className="history-timeline">
          {entries.map((entry) => (
            <li key={entry.id} className="history-event">
              <article>
                <header className="history-event-heading">
                  <div>
                    <p className="document-kicker">Revision {entry.revision}</p>
                    <h3>{formatHistoryAction(entry.action)}</h3>
                  </div>
                  <time dateTime={entry.occurredAt}>
                    {formatInstant(entry.occurredAt)}
                  </time>
                </header>
                <p className="history-actor">
                  Changed by {entry.actor.email} <code>{entry.actor.id}</code>
                </p>
                {entry.before ? (
                  <Snapshot title="Previous state" snapshot={entry.before} />
                ) : (
                  <p className="no-previous-state">
                    No previous state — this revision created the contract.
                  </p>
                )}
                <Snapshot title="New state" snapshot={entry.after} />
              </article>
            </li>
          ))}
        </ol>
      </section>
      <nav className="history-links" aria-label="Contract navigation">
        <Link className="text-link" to={`/contracts/${contract.id}`}>
          Open current detail
        </Link>
        <Link className="text-link" to="/">
          Back to register
        </Link>
      </nav>
    </main>
  );
}

function Snapshot({
  title,
  snapshot,
}: {
  title: string;
  snapshot: ResolvedHistorySnapshot;
}) {
  return (
    <section className="history-snapshot" aria-label={title}>
      <h4>{title}</h4>
      <dl className="snapshot-metadata">
        <div>
          <dt>Status</dt>
          <dd>{formatContractStatus(snapshot.status)}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{snapshot.revision}</dd>
        </div>
        <div>
          <dt>Template version</dt>
          <dd>
            <code>{snapshot.templateVersion.id}</code>
          </dd>
        </div>
      </dl>
      <dl className="snapshot-fields">
        {snapshot.templateVersion.fields.map((field) => (
          <div key={field.key}>
            <dt>{field.label}</dt>
            <dd>{formatContractValue({ field, values: snapshot.values })}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function HistoryNotFound() {
  return (
    <main className="empty-main">
      <section
        className="empty-state"
        aria-labelledby="history-not-found-heading"
      >
        <p className="empty-state-mark" aria-hidden="true">
          —
        </p>
        <h1 id="history-not-found-heading">Contract history not found</h1>
        <p>
          This contract does not exist, or it is not available in your
          workspace.
        </p>
        <Link className="button-link" to="/">
          Back to register
        </Link>
      </section>
    </main>
  );
}
