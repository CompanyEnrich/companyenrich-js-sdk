import { CompanyEnrichError } from './errors.js';
import type { HttpClient, HttpRequest } from './http.js';

export interface Page<T> {
  items: T[];
  nextCursor?: string | null;
}

export function withCursor<T extends object>(params: T, cursor: string | undefined): T {
  return cursor ? { ...params, cursor } : params;
}

/** Lazily yields every item across pages. A page is only requested once the previous one is consumed. */
export async function* paginate<T>(
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
  firstCursor?: string | null,
): AsyncGenerator<T, void, undefined> {
  let cursor = firstCursor ?? undefined;
  do {
    const page = await fetchPage(cursor);
    yield* page.items;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
}

/** Requests an NDJSON endpoint and yields one parsed record per line. */
export async function* streamNdjson<T>(
  http: HttpClient,
  request: HttpRequest,
): AsyncGenerator<T, void, undefined> {
  const { response, release } = await http.stream(request);
  try {
    if (!response.body) {
      throw new CompanyEnrichError('The API returned an empty response body');
    }
    yield* parseNdjson<T>(response.body);
  } finally {
    release();
  }
}

export async function* parseNdjson<T>(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<T, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let start = 0;
      let newline = buffer.indexOf('\n', start);
      while (newline !== -1) {
        const line = buffer.slice(start, newline).trim();
        start = newline + 1;
        if (line) yield JSON.parse(line) as T;
        newline = buffer.indexOf('\n', start);
      }
      buffer = buffer.slice(start);
    }

    const last = (buffer + decoder.decode()).trim();
    if (last) yield JSON.parse(last) as T;
  } finally {
    // Stops the download if the caller breaks out of the loop early.
    await reader.cancel().catch(() => undefined);
  }
}
