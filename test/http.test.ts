import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  AuthenticationError,
  BadRequestError,
  CompanyEnrich,
  CompanyEnrichError,
  ConnectionError,
  NotFoundError,
  PaymentRequiredError,
  PermissionDeniedError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
} from '../src/index.js';
import { clientWith, json, problem, requestOf } from './helpers.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('requests', () => {
  it('sends the bearer token and targets the production API', async () => {
    const { client, fetch } = clientWith([json({ id: 'u' })]);
    await client.me();
    const { url, headers, init } = requestOf(fetch);
    expect(url.href).toBe('https://api.companyenrich.com/v2/me');
    expect(init.method).toBe('GET');
    expect(headers.get('authorization')).toBe('Bearer test-key');
    expect(headers.get('user-agent')).toMatch(/^companyenrich-js\//);
    expect(headers.has('content-type')).toBe(false);
  });

  it('reads the API key from the environment', async () => {
    vi.stubEnv('COMPANYENRICH_API_KEY', 'env-key');
    const fetch = vi.fn(async () => json({}));
    await new CompanyEnrich({ fetch: fetch as unknown as typeof globalThis.fetch }).me();
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer env-key');
  });

  it('throws a helpful error when no API key is available', () => {
    vi.stubEnv('COMPANYENRICH_API_KEY', '');
    expect(() => new CompanyEnrich()).toThrow(/Missing API key/);
  });

  it('uses the global fetch when none is provided', async () => {
    const globalFetch = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', globalFetch);
    await new CompanyEnrich({ apiKey: 'k' }).me();
    expect(globalFetch).toHaveBeenCalledOnce();
  });

  it('repeats array query params and omits undefined ones', async () => {
    const { client, fetch } = clientWith([json({})]);
    await client.companies.enrich({
      domain: 'stripe.com',
      expand: ['financial', 'workforce'],
      waitForEnrichment: false,
    });
    const { url } = requestOf(fetch);
    expect(url.searchParams.get('domain')).toBe('stripe.com');
    expect(url.searchParams.getAll('expand')).toEqual(['financial', 'workforce']);
    expect(url.searchParams.get('waitForEnrichment')).toBe('false');
    expect(url.searchParams.has('cursor')).toBe(false);
  });

  it('sends JSON bodies and an empty object by default for searches', async () => {
    const { client, fetch } = clientWith([json({ items: [] })]);
    await client.companies.search();
    const { init, headers } = requestOf(fetch);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('encodes path params and accepts bigint person IDs', async () => {
    const { client, fetch } = clientWith([json({}), json({})]);
    await client.geo.country('a/b');
    await client.people.get(9007199254740993n);
    expect(requestOf(fetch, 0).url.pathname).toBe('/v2/geo/countries/a%2Fb');
    expect(requestOf(fetch, 1).url.pathname).toBe('/v2/people/9007199254740993');
  });

  it('merges default and per-request headers and trims the base URL', async () => {
    const { client, fetch } = clientWith([json({})], {
      baseUrl: 'https://proxy.example.com/ce/',
      defaultHeaders: { 'x-team': 'growth', 'x-override': 'default' },
    });
    await client.me({ headers: { 'x-override': 'request' } });
    const { url, headers } = requestOf(fetch);
    expect(url.href).toBe('https://proxy.example.com/ce/v2/me');
    expect(headers.get('x-team')).toBe('growth');
    expect(headers.get('x-override')).toBe('request');
  });
});

describe('errors', () => {
  it.each([
    [400, BadRequestError],
    [401, AuthenticationError],
    [402, PaymentRequiredError],
    [403, PermissionDeniedError],
    [404, NotFoundError],
    [422, ValidationError],
    [429, RateLimitError],
    [500, ServerError],
    [503, ServerError],
    [413, ApiError],
  ])('maps %i to the matching error class', async (status, ErrorClass) => {
    const { client } = clientWith([problem(status)], { maxRetries: 0 });
    const error = await client.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error).toBeInstanceOf(CompanyEnrichError);
    expect((error as ApiError).status).toBe(status);
    expect((error as Error).name).toBe(ErrorClass.name);
  });

  it('exposes problem details and the trace ID', async () => {
    const { client } = clientWith([
      problem(
        401,
        { title: 'Unauthorized', detail: 'Invalid token.', type: 'about:blank' },
        { 'x-trace-id': 'trace-123' },
      ),
    ]);
    const error = (await client.me().catch((e: unknown) => e)) as AuthenticationError;
    expect(error.message).toBe('401 Unauthorized: Invalid token.');
    expect(error.title).toBe('Unauthorized');
    expect(error.detail).toBe('Invalid token.');
    expect(error.type).toBe('about:blank');
    expect(error.traceId).toBe('trace-123');
  });

  it('includes field-level validation messages', async () => {
    const { client } = clientWith([
      problem(422, { title: 'Validation', errors: { domain: ['Required', 'Too short'] } }),
    ]);
    const error = (await client.me().catch((e: unknown) => e)) as ValidationError;
    expect(error.errors).toEqual({ domain: ['Required', 'Too short'] });
    expect(error.message).toContain('domain: Required, Too short');
  });

  it('keeps non-JSON error bodies', async () => {
    const { client } = clientWith([new Response('<html>Bad gateway</html>', { status: 502 })], {
      maxRetries: 0,
    });
    const error = (await client.me().catch((e: unknown) => e)) as ServerError;
    expect(error).toBeInstanceOf(ServerError);
    expect(error.body).toBe('<html>Bad gateway</html>');
    expect(error.message).toBe('502');
  });

  it('reports a malformed success body without retrying', async () => {
    const { client, fetch } = clientWith([new Response('not json')]);
    await expect(client.me()).rejects.toThrow(/invalid JSON/);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('retries', () => {
  it('retries a 429 on a credit-consuming POST, honoring Retry-After', async () => {
    const { client, fetch } = clientWith([
      problem(429, {}, { 'retry-after': '0' }),
      json({ items: [] }),
    ]);
    await expect(client.companies.search({ pageSize: 1 })).resolves.toEqual({ items: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('waits for the x-ratelimit-window reported on a 429', async () => {
    vi.useFakeTimers();
    const { client, fetch } = clientWith([
      problem(429, {}, { 'x-ratelimit-window': '00:00:35.5000000' }),
      json({}),
    ]);
    const pending = client.me();
    await vi.advanceTimersByTimeAsync(35_400);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await pending;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stops retrying when the server asks for an unreasonably long wait', async () => {
    const { client, fetch } = clientWith([problem(429, {}, { 'retry-after': '3600' })]);
    await expect(client.me()).rejects.toBeInstanceOf(RateLimitError);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([500, 502, 503, 504])('retries a GET on %i', async (status) => {
    vi.useFakeTimers();
    const { client, fetch } = clientWith([problem(status), json({ ok: true })]);
    const pending = client.me();
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries a GET after a connection failure', async () => {
    vi.useFakeTimers();
    const { client, fetch } = clientWith([new TypeError('fetch failed'), json({ ok: true })]);
    const pending = client.me();
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['company search', (c: CompanyEnrich) => c.companies.search({})],
    ['people search', (c: CompanyEnrich) => c.people.search({})],
    ['enrich by properties', (c: CompanyEnrich) => c.companies.enrichByProperties({ name: 'x' })],
    ['batch enrich', (c: CompanyEnrich) => c.companies.enrichBatch({ domains: ['a.com'] })],
    ['bulk enrichment', (c: CompanyEnrich) => c.companies.bulkEnrichment.create({ domains: ['a.com'] })],
    ['search export', (c: CompanyEnrich) => c.people.searchExport.create({ limit: 1 })],
    ['person enrich', (c: CompanyEnrich) => c.people.enrich({ email: 'a@b.co' })],
  ])('does not repeat %s after an ambiguous failure', async (_name, call) => {
    const server = clientWith([problem(503)]);
    await expect(call(server.client)).rejects.toBeInstanceOf(ServerError);
    expect(server.fetch).toHaveBeenCalledOnce();

    const network = clientWith([new TypeError('socket hang up')]);
    await expect(call(network.client)).rejects.toBeInstanceOf(ConnectionError);
    expect(network.fetch).toHaveBeenCalledOnce();
  });

  it.each([
    ['company count', (c: CompanyEnrich) => c.companies.count()],
    ['people preview', (c: CompanyEnrich) => c.people.preview()],
    ['geo search', (c: CompanyEnrich) => c.geo.searchCountries()],
    ['batch cancel', (c: CompanyEnrich) => c.batches.cancel('id')],
  ])('retries free POST endpoint: %s', async (_name, call) => {
    vi.useFakeTimers();
    const { client, fetch } = clientWith([problem(500), json({})]);
    const pending = call(client);
    await vi.runAllTimersAsync();
    await pending;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry client errors', async () => {
    const { client, fetch } = clientWith([problem(404)]);
    await expect(client.me()).rejects.toBeInstanceOf(NotFoundError);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('gives up after maxRetries and throws the last failure', async () => {
    vi.useFakeTimers();
    const { client, fetch } = clientWith([problem(503), problem(503), problem(503)], {
      maxRetries: 2,
    });
    const pending = client.me().catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await pending).toBeInstanceOf(ServerError);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('lets a request override maxRetries', async () => {
    const { client, fetch } = clientWith([problem(503)]);
    await expect(client.me({ maxRetries: 0 })).rejects.toBeInstanceOf(ServerError);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

function hangingFetch() {
  return vi.fn(
    (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }),
  ) as unknown as typeof globalThis.fetch;
}

describe('timeouts and cancellation', () => {
  it('throws TimeoutError when a request exceeds its timeout', async () => {
    const client = new CompanyEnrich({
      apiKey: 'k',
      fetch: hangingFetch(),
      timeoutMs: 5,
      maxRetries: 0,
    });
    await expect(client.me()).rejects.toBeInstanceOf(TimeoutError);
  });

  it('does not repeat a timed-out POST', async () => {
    const fetch = hangingFetch();
    const client = new CompanyEnrich({ apiKey: 'k', fetch, timeoutMs: 5 });
    await expect(client.companies.search()).rejects.toBeInstanceOf(TimeoutError);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects with the caller’s abort reason and does not retry', async () => {
    const fetch = hangingFetch();
    const client = new CompanyEnrich({ apiKey: 'k', fetch });
    const controller = new AbortController();
    const reason = new Error('stop');
    const pending = client.me({ signal: controller.signal });
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not send a request if already aborted', async () => {
    const fetch = hangingFetch();
    const client = new CompanyEnrich({ apiKey: 'k', fetch });
    await expect(client.me({ signal: AbortSignal.abort() })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('interrupts a retry wait when aborted', async () => {
    const { client } = clientWith([problem(503)]);
    const controller = new AbortController();
    const reason = new Error('stop');
    const pending = client.me({ signal: controller.signal });
    setTimeout(() => controller.abort(reason), 5);
    await expect(pending).rejects.toBe(reason);
  });
});
