import { vi } from 'vitest';
import { CompanyEnrich, type ClientOptions } from '../src/index.js';

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function problem(
  status: number,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ status, ...body }), {
    status,
    headers: { 'content-type': 'application/problem+json', ...headers },
  });
}

/** Creates a client whose `fetch` plays back `responses` in order. */
export function clientWith(responses: (Response | Error)[], options: ClientOptions = {}) {
  const queue = [...responses];
  const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error('Unexpected extra request');
    if (next instanceof Error) throw next;
    return next;
  });
  const client = new CompanyEnrich({
    apiKey: 'test-key',
    fetch: fetch as unknown as typeof globalThis.fetch,
    ...options,
  });
  return { client, fetch };
}

export function requestOf(fetch: ReturnType<typeof clientWith>['fetch'], call = 0) {
  const [url, init] = fetch.mock.calls[call] as [string, RequestInit];
  return { url: new URL(url), init, headers: new Headers(init.headers) };
}

export function ndjsonBody(...chunks: (string | Uint8Array)[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } });
}

export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}
