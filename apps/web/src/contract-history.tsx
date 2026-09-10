import { Link, useParams } from "react-router";
import { formatContractStatus } from "./contract-presentation";
import {
  ContractHistoryTimeline,
  type ContractHistorySession,
  useContractHistory,
} from "./contract-history-view";

export type { ContractHistorySession } from "./contract-history-view";

export function ContractHistoryPage({
  session,
  onAuthenticationLost,
}: {
  session: ContractHistorySession;
  onAuthenticationLost: () => void;
}) {
  const { contractId = "" } = useParams();
  const { state, reload } = useContractHistory({
    contractId,
    session,
    onAuthenticationLost,
  });
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
            <button type="button" onClick={() => void reload()}>
              Try again
            </button>
            <Link className="button-link secondary-link" to="/">
              Back to register
            </Link>
          </div>
        </section>
      </main>
    );

  const { history } = state;
  return (
    <main className="history-main">
      <header className="history-heading">
        <div>
          <p className="document-kicker">Immutable audit history</p>
          <h1>Contract history</h1>
          <code>{history.contract.id}</code>
        </div>
        <span
          className={`status-badge status-${history.contract.status.toLowerCase()}`}
        >
          {formatContractStatus(history.contract.status)} · Revision{" "}
          {history.contract.revision}
        </span>
      </header>
      <ContractHistoryTimeline history={history} mode="full" />
      <nav className="history-links" aria-label="Contract navigation">
        <Link className="text-link" to={`/contracts/${history.contract.id}`}>
          Open current detail
        </Link>
        <Link className="text-link" to="/">
          Back to register
        </Link>
      </nav>
    </main>
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
