import {
  CompanyEnrichError,
  ConnectionError,
  TimeoutError,
  createApiError,
} from './errors.js';

declare const __SDK_VERSION__: string;

export const SDK_VERSION = __SDK_VERSION__;

const DEFAULT_BASE_URL = 'https://api.companyenrich.com';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;
const MAX_SERVER_REQUESTED_WAIT_MS = 60_000;
const RETRYABLE_STATUSES = new Set([408, 500, 502, 503, 504]);

/** Spelled this way because the global `HeadersInit` type only exists in projects using the DOM lib. */
type HeaderValues = NonNullable<ConstructorParameters<typeof Headers>[0]>;

export interface ClientOptions {
  /** API key. Defaults to the `COMPANYENRICH_API_KEY` environment variable. */
  apiKey?: string;
  /** Defaults to `https://api.companyenrich.com`. */
  baseUrl?: string;
  /** Per-attempt timeout in milliseconds. `0` disables it. Defaults to 120000. */
  timeoutMs?: number;
  /** How many times to retry a failed request. Defaults to 2. */
  maxRetries?: number;
  /** Custom `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Headers sent with every request. */
  defaultHeaders?: HeaderValues;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  headers?: HeaderValues;
}

type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];

export interface HttpRequest {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, QueryValue> | undefined;
  body?: unknown;
  /**
   * Whether the request can be repeated after an ambiguous failure, such as a
   * dropped connection or a 5xx response, without risking a double charge or a
   * duplicate batch. Defaults to true for GET and false for POST.
   */
  retrySafe?: boolean;
  options?: RequestOptions | undefined;
}

export interface StreamedResponse {
  response: Response;
  /** Detaches the caller's abort signal once the stream has been consumed. */
  release: () => void;
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: HeaderValues | undefined;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnvApiKey();
    if (!apiKey) {
      throw new CompanyEnrichError(
        'Missing API key. Pass `apiKey` or set the COMPANYENRICH_API_KEY environment variable.',
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.defaultHeaders = options.defaultHeaders;
  }

  /** Sends a request and parses the JSON response. */
  request<T>(request: HttpRequest): Promise<T> {
    return this.execute(request, 'application/json', async (response, scope) => {
      try {
        return await parseJson<T>(response);
      } finally {
        scope.dispose();
      }
    });
  }

  /** Sends a request and hands back the unread response. The timeout stops once headers arrive. */
  stream(request: HttpRequest): Promise<StreamedResponse> {
    return this.execute(request, '*/*', async (response, scope) => {
      scope.stopTimer();
      return { response, release: () => scope.dispose() };
    });
  }

  private async execute<T>(
    request: HttpRequest,
    accept: string,
    consume: (response: Response, scope: AbortScope) => Promise<T>,
  ): Promise<T> {
    const { options } = request;
    const signal = options?.signal;
    const maxRetries = options?.maxRetries ?? this.maxRetries;
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
    const retrySafe = request.retrySafe ?? request.method === 'GET';
    const url = this.buildUrl(request);
    const init: RequestInit = {
      method: request.method,
      headers: this.buildHeaders(request, accept),
    };
    if (request.body !== undefined) {
      init.body = JSON.stringify(request.body);
    }

    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      const scope = new AbortScope(signal, timeoutMs);
      let failure: CompanyEnrichError;
      let delayMs: number | undefined;

      try {
        const response = await this.fetchImpl(url, { ...init, signal: scope.signal });
        if (response.ok) {
          return await consume(response, scope);
        }
        const body = await readErrorBody(response);
        scope.dispose();
        failure = createApiError({ status: response.status, headers: response.headers, body });
        delayMs = retryDelay(response, attempt, retrySafe);
      } catch (cause) {
        scope.dispose();
        if (signal?.aborted) {
          throw signal.reason;
        }
        if (cause instanceof CompanyEnrichError) {
          throw cause;
        }
        failure = scope.timedOut
          ? new TimeoutError(`Request timed out after ${timeoutMs} ms`, { cause })
          : new ConnectionError(`Could not reach the CompanyEnrich API: ${describe(cause)}`, {
              cause,
            });
        delayMs = retrySafe ? backoff(attempt) : undefined;
      }

      if (delayMs === undefined || attempt >= maxRetries) {
        throw failure;
      }
      await sleep(delayMs, signal);
    }
  }

  private buildUrl({ path, query }: HttpRequest): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value as readonly (string | number)[]) {
          params.append(key, String(item));
        }
      } else {
        params.append(key, String(value));
      }
    }
    const queryString = params.toString();
    return `${this.baseUrl}${path}${queryString ? `?${queryString}` : ''}`;
  }

  private buildHeaders({ body, options }: HttpRequest, accept: string): Headers {
    const headers = new Headers({
      Accept: accept,
      Authorization: `Bearer ${this.apiKey}`,
      'User-Agent': `companyenrich-js/${SDK_VERSION}`,
    });
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    for (const extra of [this.defaultHeaders, options?.headers]) {
      new Headers(extra).forEach((value, key) => headers.set(key, value));
    }
    return headers;
  }
}

/** Combines the caller's abort signal with a per-attempt timeout. */
class AbortScope {
  readonly signal: AbortSignal;
  timedOut = false;
  private readonly timer: ReturnType<typeof setTimeout> | undefined;
  private readonly detachParent: (() => void) | undefined;

  constructor(parent: AbortSignal | undefined, timeoutMs: number) {
    const controller = new AbortController();
    this.signal = controller.signal;
    if (parent) {
      const onAbort = () => controller.abort(parent.reason);
      parent.addEventListener('abort', onAbort, { once: true });
      this.detachParent = () => parent.removeEventListener('abort', onAbort);
    }
    if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
      this.timer = setTimeout(() => {
        this.timedOut = true;
        controller.abort();
      }, timeoutMs);
    }
  }

  stopTimer(): void {
    clearTimeout(this.timer);
  }

  dispose(): void {
    this.stopTimer();
    this.detachParent?.();
  }
}

function retryDelay(
  response: Response,
  attempt: number,
  retrySafe: boolean,
): number | undefined {
  // A 429 is rejected before any work happens, so it is safe to repeat for every request.
  const retryable =
    response.status === 429 || (retrySafe && RETRYABLE_STATUSES.has(response.status));
  if (!retryable) return undefined;

  const requested =
    parseRetryAfter(response.headers.get('retry-after')) ??
    (response.status === 429 ? parseTimeSpan(response.headers.get('x-ratelimit-window')) : undefined);
  if (requested === undefined) return backoff(attempt);
  return requested <= MAX_SERVER_REQUESTED_WAIT_MS ? requested : undefined;
}

function backoff(attempt: number): number {
  const ceiling = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return ceiling * (0.75 + Math.random() * 0.25);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** Parses a .NET TimeSpan such as `00:00:35.7551671` into milliseconds. */
function parseTimeSpan(value: string | null): number | undefined {
  const match = value?.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) return undefined;
  const [, hours, minutes, seconds] = match;
  return (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000;
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (text === '') return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new CompanyEnrichError(
      `The API returned an invalid JSON response (status ${response.status})`,
      { cause },
    );
  }
}

async function readErrorBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function readEnvApiKey(): string | undefined {
  const { process } = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return process?.env?.COMPANYENRICH_API_KEY;
}

/** Waits for `ms` milliseconds, rejecting early if `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
