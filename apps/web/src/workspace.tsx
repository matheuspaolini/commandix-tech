import { type ChangeEvent, type SubmitEvent, useEffect, useState } from "react";

import {
  API_ENDPOINTS,
  BrowserSession,
  client,
  type SignInForm,
} from "@/shared/api";
import { PageShell } from "@/shared/ui";
import { ContractCreationForm } from "./contract-creation-form";

type Identity = {
  user: { id: string; email: string };
  tenant: { id: string; slug: string };
  role: "ADMIN" | "MEMBER";
};

const initialSignInForm: SignInForm = { slug: "", email: "", password: "" };
const browserSession = new BrowserSession(client);

type WorkspaceState =
  | { status: "restoring" }
  | { status: "signedOut"; signInFailed: boolean }
  | { status: "signingIn" }
  | { status: "signedIn"; identity: Identity };

export function Workspace() {
  const [form, setForm] = useState(initialSignInForm);
  const [state, setState] = useState<WorkspaceState>({ status: "restoring" });

  useEffect(() => {
    let active = true;

    void restoreIdentity().then(
      (identity) => active && setState({ status: "signedIn", identity }),
      () => active && setState({ status: "signedOut", signInFailed: false }),
    );

    return () => {
      active = false;
    };
  }, []);

  async function signIn(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "signingIn" });
    try {
      await browserSession.signIn(form);
      const identity = await requestIdentity();
      setState({ status: "signedIn", identity });
    } catch {
      browserSession.clear();
      setState({ status: "signedOut", signInFailed: true });
    }
  }

  async function signOut() {
    setState({ status: "signedOut", signInFailed: false });
    await browserSession.signOut();
  }

  function updateField(event: ChangeEvent<HTMLInputElement>) {
    const field = event.target.name as keyof SignInForm;
    const value = event.target.value;

    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  if (state.status === "restoring") {
    return (
      <PageShell>
        <main aria-busy="true">
          <p>Restoring your session…</p>
        </main>
      </PageShell>
    );
  }

  if (state.status === "signedIn") {
    return (
      <PageShell>
        <main>
          <p className="eyebrow">{state.identity.role}</p>
          <h1>{state.identity.tenant.slug}</h1>
          <p className="intro">You are signed in to your contract workspace.</p>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
          <ContractCreationForm session={browserSession} />
        </main>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <main className="sign-in-main">
        <section className="sign-in-card" aria-labelledby="sign-in-heading">
          <p className="eyebrow">Contract workspace</p>
          <h1 id="sign-in-heading">Sign in to Commandix</h1>
          <p className="intro">
            Use your tenant workspace credentials to continue.
          </p>
          <form
            onSubmit={signIn}
            aria-describedby={
              state.status === "signedOut" && state.signInFailed
                ? "sign-in-error"
                : undefined
            }
          >
            <label htmlFor="tenant-slug">Tenant slug</label>
            <input
              id="tenant-slug"
              name="slug"
              autoComplete="organization"
              disabled={state.status === "signingIn"}
              required
              value={form.slug}
              onChange={updateField}
            />
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              disabled={state.status === "signingIn"}
              required
              value={form.email}
              onChange={updateField}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              disabled={state.status === "signingIn"}
              required
              value={form.password}
              onChange={updateField}
            />
            {state.status === "signedOut" && state.signInFailed ? (
              <p id="sign-in-error" className="form-error" role="alert">
                We could not sign you in. Check your details and try again.
              </p>
            ) : null}
            <button type="submit" disabled={state.status === "signingIn"}>
              {state.status === "signingIn" ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    </PageShell>
  );
}

async function restoreIdentity(): Promise<Identity> {
  await browserSession.restore();
  return requestIdentity();
}

function requestIdentity(): Promise<Identity> {
  return browserSession.requestJson(API_ENDPOINTS.identity, {
    isValid: isIdentity,
  });
}

function isIdentity(value: unknown): value is Identity {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Identity>;
  return (
    typeof candidate.user?.id === "string" &&
    typeof candidate.user.email === "string" &&
    typeof candidate.tenant?.id === "string" &&
    typeof candidate.tenant.slug === "string" &&
    (candidate.role === "ADMIN" || candidate.role === "MEMBER")
  );
}
