export type TypeGuard<Value> = (value: unknown) => value is Value;

export type Fetcher = (
  ...arguments_: Parameters<typeof globalThis.fetch>
) => ReturnType<typeof globalThis.fetch>;

export type RequestJsonOptions<Value> = {
  init?: RequestInit;
  isValid: TypeGuard<Value>;
};

export class Client {
  constructor(private readonly fetcher: Fetcher) {}

  async requestJson<Value>(
    url: string,
    { init, isValid }: RequestJsonOptions<Value>,
  ): Promise<Value> {
    const response = await this.fetcher(url, init);

    if (!response.ok) throw new Error("Request failed");

    const body: unknown = await response.json();

    if (!isValid(body)) throw new Error("Invalid response");

    return body;
  }
}

export const client = new Client((input, init) =>
  globalThis.fetch(input, init),
);
