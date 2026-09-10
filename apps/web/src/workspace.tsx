import {
  type ChangeEvent,
  type SubmitEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";

import {
  API_ENDPOINTS,
  BrowserSession,
  client,
  isUuidV4,
  type SignInForm,
} from "@/shared/api";
import { PageShell } from "@/shared/ui";
import { ContractCreationForm } from "./contract-creation-form";
import { ContractDetailPage, RouteNotFoundPage } from "./contract-detail";
import { ContractHistoryPage } from "./contract-history";
import { ContractRegister } from "./contract-register";

type Identity = {
  user: { id: string; email: string };
  tenant: { id: string; slug: string };
  role: "ADMIN" | "MEMBER";
};
type WorkspaceState =
  | { status: "restoring" }
  | { status: "signedOut"; signInFailed: boolean }
  | { status: "signingIn" }
  | { status: "signedIn"; identity: Identity };

const initialSignInForm: SignInForm = { slug: "", email: "", password: "" };
const browserSession = new BrowserSession(client);

export function Workspace() {
  const [state, setState] = useState<WorkspaceState>({ status: "restoring" });
  const navigate = useNavigate();
  const location = useLocation();

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

  const authenticationLost = useCallback(() => {
    browserSession.clear();
    setState({ status: "signedOut", signInFailed: false });
    navigate(signInDestination(`${location.pathname}${location.search}`), {
      replace: true,
    });
  }, [location.pathname, location.search, navigate]);

  async function signOut() {
    setState({ status: "signedOut", signInFailed: false });
    navigate("/sign-in", { replace: true });
    await browserSession.signOut();
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
        <Routes>
          <Route
            path="/sign-in"
            element={
              <Navigate replace to={returnDestination(location.search)} />
            }
          />
          <Route
            path="/"
            element={
              <WorkspaceHome
                identity={state.identity}
                signOut={signOut}
                onAuthenticationLost={authenticationLost}
              />
            }
          />
          <Route
            path="/contracts/:contractId"
            element={
              <ContractDetailPage
                session={browserSession}
                role={state.identity.role}
                onAuthenticationLost={authenticationLost}
              />
            }
          />
          <Route
            path="/contracts/:contractId/history"
            element={
              <ContractHistoryPage
                session={browserSession}
                onAuthenticationLost={authenticationLost}
              />
            }
          />
          <Route path="*" element={<RouteNotFoundPage />} />
        </Routes>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Routes>
        <Route
          path="/sign-in"
          element={
            <SignInPage
              failed={state.status === "signedOut" && state.signInFailed}
              pending={state.status === "signingIn"}
              onStateChange={setState}
            />
          }
        />
        <Route
          path="/"
          element={<Navigate replace to={signInDestination("/")} />}
        />
        <Route path="/contracts/:contractId" element={<ProtectedRedirect />} />
        <Route
          path="/contracts/:contractId/history"
          element={<ProtectedRedirect />}
        />
        <Route path="*" element={<RouteNotFoundPage />} />
      </Routes>
    </PageShell>
  );
}

function WorkspaceHome({
  identity,
  signOut,
  onAuthenticationLost,
}: {
  identity: Identity;
  signOut: () => Promise<void>;
  onAuthenticationLost: () => void;
}) {
  return (
    <main>
      <p className="eyebrow">{identity.role}</p>
      <h1>{identity.tenant.slug}</h1>
      <p className="intro">You are signed in to your contract workspace.</p>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
      <ContractRegister
        session={browserSession}
        onAuthenticationLost={onAuthenticationLost}
      />
      <ContractCreationForm session={browserSession} />
    </main>
  );
}

function SignInPage({
  failed,
  pending,
  onStateChange,
}: {
  failed: boolean;
  pending: boolean;
  onStateChange: (state: WorkspaceState) => void;
}) {
  const [form, setForm] = useState(initialSignInForm);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  async function signIn(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onStateChange({ status: "signingIn" });
    try {
      await browserSession.signIn(form);
      const identity = await requestIdentity();
      onStateChange({ status: "signedIn", identity });
      navigate(validateReturnTo(searchParams.get("returnTo")), {
        replace: true,
      });
    } catch {
      browserSession.clear();
      onStateChange({ status: "signedOut", signInFailed: true });
    }
  }

  function updateField(event: ChangeEvent<HTMLInputElement>) {
    const field = event.target.name as keyof SignInForm;
    setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  return (
    <main className="sign-in-main">
      <section className="sign-in-card" aria-labelledby="sign-in-heading">
        <p className="eyebrow">Contract workspace</p>
        <h1 id="sign-in-heading">Sign in to Commandix</h1>
        <p className="intro">
          Use your tenant workspace credentials to continue.
        </p>
        <form
          onSubmit={signIn}
          aria-describedby={failed ? "sign-in-error" : undefined}
        >
          <label htmlFor="tenant-slug">Tenant slug</label>
          <input
            id="tenant-slug"
            name="slug"
            autoComplete="organization"
            disabled={pending}
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
            disabled={pending}
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
            disabled={pending}
            required
            value={form.password}
            onChange={updateField}
          />
          {failed ? (
            <p id="sign-in-error" className="form-error" role="alert">
              We could not sign you in. Check your details and try again.
            </p>
          ) : null}
          <button type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function ProtectedRedirect() {
  const location = useLocation();
  return (
    <Navigate
      replace
      to={signInDestination(`${location.pathname}${location.search}`)}
    />
  );
}

export function validateReturnTo(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("#"))
    return "/";
  let destination: URL;
  try {
    destination = new URL(value, "http://commandix.local");
  } catch {
    return "/";
  }
  if (destination.origin !== "http://commandix.local") return "/";
  if (destination.pathname === "/") {
    const keys = [...destination.searchParams.keys()];
    const validRegisterQuery =
      keys.length === 0 ||
      (keys.length === 1 &&
        keys[0] === "after" &&
        destination.searchParams.getAll("after").length === 1 &&
        destination.searchParams.get("after") !== "");
    return validRegisterQuery
      ? `${destination.pathname}${destination.search}`
      : "/";
  }
  if (destination.search) return "/";
  const match = /^\/contracts\/([^/]+)(?:\/history)?$/.exec(
    destination.pathname,
  );
  return match && isUuidV4(match[1]!) ? destination.pathname : "/";
}

function signInDestination(pathname: string): string {
  return `/sign-in?returnTo=${encodeURIComponent(pathname)}`;
}

function returnDestination(search: string): string {
  return validateReturnTo(new URLSearchParams(search).get("returnTo"));
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
