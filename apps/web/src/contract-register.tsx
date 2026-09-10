import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import {
  API_ENDPOINTS,
  ApiResponseError,
  type AuthenticatedJsonOptions,
  type ContractRegisterPage,
  isContractRegisterPage,
} from "@/shared/api";
import { formatContractStatus, formatInstant } from "./contract-presentation";

export interface ContractRegisterSession {
  requestJson<Value>(
    url: string,
    options: AuthenticatedJsonOptions<Value>,
  ): Promise<Value>;
}

type RegisterState =
  | { status: "loading" }
  | { status: "ready"; page: ContractRegisterPage }
  | { status: "invalidPage" }
  | { status: "failed" };

export function ContractRegister({
  session,
  onAuthenticationLost,
}: {
  session: ContractRegisterSession;
  onAuthenticationLost: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<RegisterState>({ status: "loading" });
  const query = searchParams.toString();
  const hasCursor = searchParams.has("after");

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    void session
      .requestJson(API_ENDPOINTS.contractRegister(query), {
        isValid: isContractRegisterPage,
      })
      .then((page) => active && setState({ status: "ready", page }))
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiResponseError && error.status === 401) {
          onAuthenticationLost();
          return;
        }
        setState(
          error instanceof ApiResponseError && error.status === 400
            ? { status: "invalidPage" }
            : { status: "failed" },
        );
      });
    return () => {
      active = false;
    };
  }, [onAuthenticationLost, query, retry, session]);

  function returnToNewest(): void {
    setSearchParams({});
  }

  return (
    <section className="contract-register" aria-labelledby="register-heading">
      <p className="document-kicker">Contract register</p>
      <h2 id="register-heading">Browse contracts</h2>
      {state.status === "loading" ? (
        <div aria-busy="true">
          <p>Opening the register…</p>
        </div>
      ) : null}
      {state.status === "invalidPage" ? (
        <div className="register-message" role="alert">
          <p>This register page address is invalid or incomplete.</p>
          <button type="button" onClick={returnToNewest}>
            Return to newest
          </button>
        </div>
      ) : null}
      {state.status === "failed" ? (
        <div className="register-message" role="alert">
          <p>The contract register could not be loaded.</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Try again
          </button>
        </div>
      ) : null}
      {state.status === "ready" && state.page.items.length === 0 ? (
        <div className="register-message">
          <p>
            {hasCursor
              ? "There are no older contracts on this page."
              : "No contracts have been created in this workspace yet."}
          </p>
          {hasCursor ? (
            <button type="button" onClick={returnToNewest}>
              Back to newest
            </button>
          ) : null}
        </div>
      ) : null}
      {state.status === "ready" && state.page.items.length > 0 ? (
        <>
          <ol className="register-list">
            {state.page.items.map((contract) => (
              <li key={contract.id} className="register-row">
                <div className="register-row-heading">
                  <code>{contract.id}</code>
                  <span
                    className={`status-badge status-${contract.status.toLowerCase()}`}
                  >
                    {formatContractStatus(contract.status)}
                  </span>
                </div>
                <dl className="register-metadata">
                  <div>
                    <dt>Revision</dt>
                    <dd>{contract.revision}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>
                      <time dateTime={contract.createdAt}>
                        {formatInstant(contract.createdAt)}
                      </time>
                    </dd>
                  </div>
                </dl>
                <div className="register-links">
                  <Link to={`/contracts/${contract.id}`}>
                    Detail for {contract.id}
                  </Link>
                  <Link to={`/contracts/${contract.id}/history`}>
                    History for {contract.id}
                  </Link>
                </div>
              </li>
            ))}
          </ol>
          <nav className="pagination" aria-label="Contract register pages">
            {hasCursor ? (
              <button type="button" onClick={returnToNewest}>
                Back to newest
              </button>
            ) : null}
            {state.page.nextCursor ? (
              <button
                type="button"
                onClick={() =>
                  setSearchParams({ after: state.page.nextCursor! })
                }
              >
                Older contracts
              </button>
            ) : (
              <p>End of register</p>
            )}
          </nav>
        </>
      ) : null}
    </section>
  );
}
