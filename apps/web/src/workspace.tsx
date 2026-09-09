import { type ChangeEvent, type FormEvent, useState } from "react";

import { API_ENDPOINTS, client } from "@/shared/api";
import { PageShell } from "@/shared/ui";

type Identity = {
  user: { id: string; email: string };
  tenant: { id: string; slug: string };
  role: "ADMIN" | "MEMBER";
};

type SignInForm = { slug: string; email: string; password: string };

const initialSignInForm: SignInForm = { slug: "", email: "", password: "" };

export function Workspace() {
  const [form, setForm] = useState(initialSignInForm);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(false);
    try {
      setIdentity(await requestIdentity(form));
    } catch {
      setIdentity(null);
      setError(true);
    } finally {
      setPending(false);
    }
  }

  function updateField(event: ChangeEvent<HTMLInputElement>) {
    const field = event.target.name as keyof SignInForm;
    const value = event.target.value;

    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  if (identity) {
    return (
      <PageShell>
        <main>
          <p className="eyebrow">{identity.role}</p>
          <h1>{identity.tenant.slug}</h1>
          <p className="intro">You are signed in to your contract workspace.</p>
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
            aria-describedby={error ? "sign-in-error" : undefined}
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
            {error ? (
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
    </PageShell>
  );
}

async function requestIdentity(form: SignInForm): Promise<Identity> {
  const credentials = await client.requestJson(API_ENDPOINTS.signIn, {
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    },
    isValid: hasAccessToken,
  });

  return client.requestJson(API_ENDPOINTS.identity, {
    init: {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    },
    isValid: isIdentity,
  });
}

function hasAccessToken(value: unknown): value is { accessToken: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { accessToken?: unknown }).accessToken === "string"
  );
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
