import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
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

export type ContractHistoryState =
  | { status: "loading" }
  | { status: "ready"; history: ContractHistory }
  | { status: "notFound" }
  | { status: "failed" };

export function useContractHistory({
  contractId,
  session,
  onAuthenticationLost,
}: {
  contractId: string;
  session: ContractHistorySession;
  onAuthenticationLost: () => void;
}) {
  const [state, setState] = useState<ContractHistoryState>({
    status: "loading",
  });
  const requestSequence = useRef(0);
  const reload = useCallback(async (): Promise<boolean> => {
    const sequence = ++requestSequence.current;
    if (!isUuidV4(contractId)) {
      setState({ status: "notFound" });
      return false;
    }
    setState({ status: "loading" });
    try {
      const history = await session.requestJson(
        API_ENDPOINTS.contractHistory(contractId),
        { isValid: isContractHistory },
      );
      if (!isContractHistory(history))
        throw new Error("Invalid Contract history");
      if (sequence === requestSequence.current)
        setState({ status: "ready", history });
      return true;
    } catch (error) {
      if (sequence !== requestSequence.current) return false;
      if (error instanceof ApiResponseError && error.status === 401) {
        onAuthenticationLost();
        return false;
      }
      setState(
        error instanceof ApiResponseError && error.status === 404
          ? { status: "notFound" }
          : { status: "failed" },
      );
      return false;
    }
  }, [contractId, onAuthenticationLost, session]);
  useEffect(() => {
    void reload();
    return () => {
      requestSequence.current += 1;
    };
  }, [reload]);
  return { state, reload };
}

export function ContractHistoryTimeline({
  history,
  mode,
}: {
  history: ContractHistory;
  mode: "preview" | "full";
}) {
  const entries =
    mode === "full" ? history.entries : history.entries.slice(-3).reverse();
  return (
    <section
      className="history-section"
      aria-labelledby={`${mode}-timeline-heading`}
    >
      <h2 id={`${mode}-timeline-heading`}>
        {mode === "full" ? "Change timeline" : "Recent history"}
      </h2>
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
      {mode === "preview" ? (
        <Link
          className="text-link"
          to={`/contracts/${history.contract.id}/history`}
        >
          View complete history
        </Link>
      ) : null}
    </section>
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
