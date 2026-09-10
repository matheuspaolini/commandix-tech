import { API_ENDPOINTS } from "./endpoints";
import {
  ApiResponseError,
  Client,
  type RequestJsonOptions,
  type TypeGuard,
} from "./client";

type AccessTokenResponse = { accessToken: string };

export type SignInForm = {
  slug: string;
  email: string;
  password: string;
};

export type AuthenticatedJsonOptions<Value> = RequestJsonOptions<Value> & {
  init?: RequestInit & { body?: string };
};

export class BrowserSession {
  private accessToken: string | null = null;
  private refreshInFlight: Promise<string> | null = null;

  constructor(private readonly client: Client) {}

  async signIn(form: SignInForm): Promise<void> {
    const credentials = await this.client.requestJson(API_ENDPOINTS.signIn, {
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
      isValid: hasAccessToken,
    });
    this.accessToken = credentials.accessToken;
  }

  async restore(): Promise<void> {
    await this.refreshAccessToken();
  }

  async requestJson<Value>(
    url: string,
    options: AuthenticatedJsonOptions<Value>,
  ): Promise<Value> {
    try {
      return await this.requestWithAccessToken(url, options);
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
    }

    await this.refreshAccessToken();

    try {
      return await this.requestWithAccessToken(url, options);
    } catch (error) {
      if (isUnauthorized(error)) this.clear();
      throw error;
    }
  }

  async signOut(): Promise<void> {
    this.clear();
    try {
      await this.client.request(API_ENDPOINTS.signOut, { method: "DELETE" });
    } catch {
      // Local sign-out must not depend on network availability.
    }
  }

  clear(): void {
    this.accessToken = null;
  }

  private refreshAccessToken(): Promise<string> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = this.requestNewAccessToken().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async requestNewAccessToken(): Promise<string> {
    try {
      const credentials = await this.client.requestJson(API_ENDPOINTS.refresh, {
        init: { method: "POST" },
        isValid: hasAccessToken,
      });
      this.accessToken = credentials.accessToken;
      return credentials.accessToken;
    } catch (error) {
      this.clear();
      throw error;
    }
  }

  private requestWithAccessToken<Value>(
    url: string,
    { init, isValid }: AuthenticatedJsonOptions<Value>,
  ): Promise<Value> {
    if (!this.accessToken) {
      return Promise.reject(new ApiResponseError(401));
    }

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${this.accessToken}`);
    return this.client.requestJson(url, {
      init: { ...init, headers },
      isValid,
    });
  }
}

export function hasAccessToken(value: unknown): value is AccessTokenResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<AccessTokenResponse>).accessToken === "string"
  );
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiResponseError && error.status === 401;
}

export type IdentityGuard<Identity> = TypeGuard<Identity>;
