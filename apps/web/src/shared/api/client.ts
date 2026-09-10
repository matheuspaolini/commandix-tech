export type TypeGuard<Value> = (value: unknown) => value is Value;

export type Fetcher = (
  ...arguments_: Parameters<typeof globalThis.fetch>
) => ReturnType<typeof globalThis.fetch>;

export type RequestJsonOptions<Value> = {
  init?: RequestInit;
  isValid: TypeGuard<Value>;
};

export class ApiResponseError extends Error {
  constructor(
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(`API request failed with status ${status}`);
  }
}

export class Client {
  constructor(private readonly fetcher: Fetcher) {}

  async requestJson<Value>(
    url: string,
    { init, isValid }: RequestJsonOptions<Value>,
  ): Promise<Value> {
    const response = await this.fetcher(url, init);

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = undefined;
      }
      throw new ApiResponseError(response.status, errorBody);
    }

    const body: unknown = await response.json();

    if (!isValid(body)) throw new Error("Invalid response");

    return body;
  }

  async request(url: string, init?: RequestInit): Promise<void> {
    const response = await this.fetcher(url, init);
    if (!response.ok) throw new ApiResponseError(response.status);
  }
}

export const client = new Client((input, init) =>
  globalThis.fetch(input, init),
);
