import { type SubmitEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import {
  API_ENDPOINTS,
  ApiResponseError,
  type AuthenticatedJsonOptions,
  type ContractDetail,
  type ContractStatus,
  isContractDetail,
  isUuidV4,
} from "@/shared/api";
import {
  formatCalendarDate,
  formatContractStatus,
  formatContractValue,
} from "./contract-presentation";
import {
  ContractHistoryTimeline,
  useContractHistory,
} from "./contract-history-view";
import {
  ContractValueFields,
  createContractValueForm,
  serializeContractValueForm,
  type ContractValueFormState,
  type ContractValueInput,
  type ContractValueIssue,
} from "./contract-values-form";

export {
  formatCalendarDate,
  formatContractStatus,
  formatContractValue,
} from "./contract-presentation";

type ContractDetailState =
  | { status: "loading" }
  | { status: "ready"; contract: ContractDetail }
  | { status: "notFound" }
  | { status: "failed" };

type TransitionTarget = "ACTIVE" | "CLOSED";
type TransitionState =
  | { status: "idle" }
  | { status: "confirming"; target: TransitionTarget }
  | { status: "pending"; target: TransitionTarget }
  | { status: "succeeded"; target: TransitionTarget }
  | { status: "failed"; target: TransitionTarget }
  | { status: "conflict"; target: TransitionTarget; reloadFailed: boolean };

type EditState =
  | { status: "viewing" }
  | {
      status: "editing";
      form: ContractValueFormState;
      baseline: ContractValueFormState;
    }
  | {
      status: "submitting";
      form: ContractValueFormState;
      baseline: ContractValueFormState;
    }
  | {
      status: "failed";
      form: ContractValueFormState;
      baseline: ContractValueFormState;
      issues: ContractValueIssue[];
    }
  | { status: "conflict"; reloadFailed: boolean }
  | { status: "saved"; outcome: "changed" | "unchanged" };

const TRANSITION_PRESENTATION = {
  ACTIVE: {
    action: "Activate contract",
    confirm: "Confirm activation",
    pending: "Activating…",
    success: "Contract activated.",
    failure: "Activation could not be completed. Try again.",
    warning: "Activation locks this contract's contents. Continue?",
  },
  CLOSED: {
    action: "Close contract",
    confirm: "Confirm closure",
    pending: "Closing…",
    success: "Contract closed.",
    failure: "Closure could not be completed. Try again.",
    warning: "Closure is terminal and cannot be reversed. Continue?",
  },
} as const;

export interface ContractDetailSession {
  requestJson<Value>(
    url: string,
    options: AuthenticatedJsonOptions<Value>,
  ): Promise<Value>;
}

export function ContractDetailPage({
  session,
  role,
  onAuthenticationLost,
}: {
  session: ContractDetailSession;
  role: "ADMIN" | "MEMBER";
  onAuthenticationLost: () => void;
}) {
  const { contractId = "" } = useParams();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<ContractDetailState>({
    status: "loading",
  });
  const [transitionState, setTransitionState] = useState<TransitionState>({
    status: "idle",
  });
  const [editState, setEditState] = useState<EditState>({ status: "viewing" });
  const history = useContractHistory({
    contractId,
    session,
    onAuthenticationLost,
  });

  useEffect(() => {
    setTransitionState({ status: "idle" });
    setEditState({ status: "viewing" });
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
  const editing =
    editState.status === "editing" ||
    editState.status === "submitting" ||
    editState.status === "failed";

  function beginEditing(): void {
    const form = createContractValueForm(contract.templateVersion.fields, {
      kind: "persisted",
      values: contract.values,
    });
    setTransitionState({ status: "idle" });
    setEditState({ status: "editing", form, baseline: form });
  }

  function updateEditField(
    key: string,
    change: Partial<ContractValueInput>,
  ): void {
    setEditState((current) => {
      if (current.status !== "editing" && current.status !== "failed")
        return current;
      return {
        status: "editing",
        baseline: current.baseline,
        form: {
          ...current.form,
          [key]: { ...current.form[key]!, ...change },
        },
      };
    });
  }

  function cancelEditing(): void {
    if (!editing) return;
    const dirty =
      JSON.stringify(editState.form) !== JSON.stringify(editState.baseline);
    if (dirty && !window.confirm("Discard unsaved Draft changes?")) return;
    setEditState({ status: "viewing" });
  }

  async function submitEdit(
    event: SubmitEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (editState.status !== "editing" && editState.status !== "failed") return;
    const { form, baseline } = editState;
    const submission = serializeContractValueForm(
      contract.templateVersion.fields,
      form,
    );
    setEditState({ status: "submitting", form, baseline });
    try {
      const updated = await session.requestJson(
        API_ENDPOINTS.editContractValues(contract.id),
        {
          init: {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedRevision: contract.revision,
              values: submission.values,
              clearedKeys: submission.excludedOptionalKeys,
            }),
          },
          isValid: isContractDetail,
        },
      );
      setState({ status: "ready", contract: updated });
      setEditState({
        status: "saved",
        outcome:
          updated.revision === contract.revision ? "unchanged" : "changed",
      });
      await history.reload();
    } catch (error) {
      if (error instanceof ApiResponseError && error.status === 401) {
        onAuthenticationLost();
        return;
      }
      if (error instanceof ApiResponseError && error.status === 409) {
        try {
          const latest = await session.requestJson(
            API_ENDPOINTS.contractDetail(contract.id),
            { isValid: isContractDetail },
          );
          setState({ status: "ready", contract: latest });
          const historyReloaded = await history.reload();
          setEditState({ status: "conflict", reloadFailed: !historyReloaded });
        } catch (reloadError) {
          if (
            reloadError instanceof ApiResponseError &&
            reloadError.status === 401
          ) {
            onAuthenticationLost();
            return;
          }
          setEditState({ status: "conflict", reloadFailed: true });
        }
        return;
      }
      setEditState({
        status: "failed",
        form,
        baseline,
        issues: contractValueIssues(error),
      });
    }
  }

  async function reloadAfterConflict(target: TransitionTarget): Promise<void> {
    try {
      const latest = await session.requestJson(
        API_ENDPOINTS.contractDetail(contract.id),
        { isValid: isContractDetail },
      );
      setState({ status: "ready", contract: latest });
      const historyReloaded = await history.reload();
      setTransitionState({
        status: "conflict",
        target,
        reloadFailed: !historyReloaded,
      });
    } catch (error) {
      if (error instanceof ApiResponseError && error.status === 401) {
        onAuthenticationLost();
        return;
      }
      setTransitionState({ status: "conflict", target, reloadFailed: true });
    }
  }

  async function transition(target: TransitionTarget): Promise<void> {
    setTransitionState({ status: "pending", target });
    try {
      const endpoint =
        target === "ACTIVE"
          ? API_ENDPOINTS.activateContract(contract.id)
          : API_ENDPOINTS.closeContract(contract.id);
      const transitioned = await session.requestJson(endpoint, {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedRevision: contract.revision }),
        },
        isValid: isContractDetail,
      });
      setState({ status: "ready", contract: transitioned });
      setTransitionState({ status: "succeeded", target });
      await history.reload();
    } catch (error) {
      if (error instanceof ApiResponseError && error.status === 401) {
        onAuthenticationLost();
        return;
      }
      if (error instanceof ApiResponseError && error.status === 409) {
        setTransitionState({ status: "conflict", target, reloadFailed: false });
        await reloadAfterConflict(target);
        return;
      }
      setTransitionState({ status: "failed", target });
    }
  }

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
          {editing ? (
            <form onSubmit={submitEdit} noValidate>
              <ContractValueFields
                fields={contract.templateVersion.fields}
                form={editState.form}
                issues={editState.status === "failed" ? editState.issues : []}
                disabled={editState.status === "submitting"}
                idPrefix="edit-contract"
                onChange={updateEditField}
              />
              <div className="contract-actions">
                <button
                  type="submit"
                  disabled={editState.status === "submitting"}
                >
                  {editState.status === "submitting"
                    ? "Saving Draft…"
                    : "Save Draft"}
                </button>
                <button
                  type="button"
                  disabled={editState.status === "submitting"}
                  onClick={cancelEditing}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
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
          )}
        </section>
        {editState.status === "saved" ? (
          <p role="status" className="form-success">
            {editState.outcome === "changed"
              ? "Draft updated."
              : "No changes to save."}
          </p>
        ) : null}
        {editState.status === "failed" && editState.issues.length === 0 ? (
          <p role="alert" className="form-error">
            The Draft could not be saved. Try again.
          </p>
        ) : null}
        {editState.status === "failed" &&
        editState.issues.some(
          (issue) => !issue.key || issue.code === "UNKNOWN_FIELD",
        ) ? (
          <p role="alert" className="form-error">
            The submitted Draft contains unsupported values.
          </p>
        ) : null}
        {editState.status === "conflict" ? (
          <div role="alert" className="form-error">
            <p>
              This contract changed. Review the latest version before editing
              again.
            </p>
            {editState.reloadFailed ? (
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Reload contract
              </button>
            ) : null}
          </div>
        ) : null}
        {transitionState.status === "succeeded" ? (
          <p role="status" className="form-success">
            {TRANSITION_PRESENTATION[transitionState.target].success}
          </p>
        ) : null}
        {transitionState.status === "failed" ? (
          <p role="alert" className="form-error">
            {TRANSITION_PRESENTATION[transitionState.target].failure}
          </p>
        ) : null}
        {transitionState.status === "conflict" ? (
          <div role="alert" className="form-error">
            <p>
              This contract changed. Review the latest version before trying
              again.
            </p>
            {transitionState.reloadFailed ? (
              <button
                type="button"
                onClick={() => void reloadAfterConflict(transitionState.target)}
              >
                Reload contract
              </button>
            ) : null}
          </div>
        ) : null}
        {role === "ADMIN" && contract.status === "DRAFT" && !editing ? (
          <section className="contract-actions" aria-label="Draft editing">
            <button type="button" onClick={beginEditing}>
              Edit Draft
            </button>
          </section>
        ) : null}
        {eligibleTransition(role, contract.status) &&
        !editing &&
        transitionState.status !== "succeeded" &&
        !(
          transitionState.status === "conflict" && transitionState.reloadFailed
        ) ? (
          <section className="contract-actions" aria-label="Contract actions">
            {transitionState.status === "idle" ||
            transitionState.status === "conflict" ||
            transitionState.status === "failed" ? (
              <button
                type="button"
                onClick={() =>
                  setTransitionState({
                    status: "confirming",
                    target: eligibleTransition(role, contract.status)!,
                  })
                }
              >
                {
                  TRANSITION_PRESENTATION[
                    eligibleTransition(role, contract.status)!
                  ].action
                }
              </button>
            ) : (
              <>
                <p>{TRANSITION_PRESENTATION[transitionState.target].warning}</p>
                <button
                  type="button"
                  disabled={transitionState.status === "pending"}
                  onClick={() => void transition(transitionState.target)}
                >
                  {transitionState.status === "pending"
                    ? TRANSITION_PRESENTATION[transitionState.target].pending
                    : TRANSITION_PRESENTATION[transitionState.target].confirm}
                </button>
                <button
                  type="button"
                  disabled={transitionState.status === "pending"}
                  onClick={() => setTransitionState({ status: "idle" })}
                >
                  Cancel
                </button>
              </>
            )}
          </section>
        ) : null}
        {history.state.status === "ready" ? (
          <ContractHistoryTimeline
            history={history.state.history}
            mode="preview"
          />
        ) : history.state.status === "failed" ? (
          <div className="form-error">
            <p>History could not be refreshed.</p>
            <button type="button" onClick={() => void history.reload()}>
              Reload history
            </button>
          </div>
        ) : history.state.status === "loading" ? (
          <p aria-busy="true">Loading recent history…</p>
        ) : null}
        <nav className="history-links" aria-label="Contract navigation">
          <Link className="text-link" to={`/contracts/${contract.id}/history`}>
            View history
          </Link>
          <Link className="text-link" to="/">
            Back to register
          </Link>
        </nav>
      </article>
    </main>
  );
}

function contractValueIssues(error: unknown): ContractValueIssue[] {
  if (!(error instanceof ApiResponseError) || !isRecord(error.body)) return [];
  if (
    error.body.code !== "INVALID_CONTRACT_VALUES" ||
    !Array.isArray(error.body.issues)
  )
    return [];
  return error.body.issues.filter(
    (issue): issue is ContractValueIssue =>
      isRecord(issue) &&
      typeof issue.code === "string" &&
      (issue.key === undefined || typeof issue.key === "string"),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function eligibleTransition(
  role: "ADMIN" | "MEMBER",
  status: ContractStatus,
): TransitionTarget | null {
  if (role !== "ADMIN") return null;
  if (status === "DRAFT") return "ACTIVE";
  if (status === "ACTIVE") return "CLOSED";
  return null;
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
