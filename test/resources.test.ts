import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  CompanyEnrich,
  NotFoundError,
  TimeoutError,
  type BatchStatus,
  type Company,
  type CompanyBulkEnrichmentResult,
  type CompanyWorkforceParams,
  type PersonEmail,
} from '../src/index.js';
import { clientWith, collect, json, ndjsonBody, problem, requestOf } from './helpers.js';

const UUID = '00000000-0000-4000-8000-000000000001';

type Invoke = (client: CompanyEnrich) => Promise<unknown> | AsyncIterable<unknown>;

/** Every operation in the OpenAPI spec and the SDK call that reaches it. */
const operations: Record<string, Invoke> = {
  'GET /v2/companies/{companyId}': (c) => c.companies.get(UUID, { expand: ['keywords'] }),
  'GET /v2/companies/enrich': (c) => c.companies.enrich({ domain: 'stripe.com' }),
  'POST /v2/companies/enrich': (c) => c.companies.enrichByProperties({ name: 'Stripe' }),
  'POST /v2/companies/enrich/batch': (c) => c.companies.enrichBatch({ domains: ['stripe.com'] }),
  'GET /v2/companies/autocomplete': (c) => c.companies.autocomplete('stri'),
  'POST /v2/companies/enrich/bulk': (c) => c.companies.bulkEnrichment.create({ domains: ['a.com'] }),
  'POST /v2/companies/search/export': (c) => c.companies.searchExport.create({ limit: 10 }),
  'POST /v2/people/search/export': (c) => c.people.searchExport.create({ limit: 10 }),
  'GET /v2/companies/enrich/bulk/{id}/results': (c) => c.companies.bulkEnrichment.results(UUID),
  'GET /v2/companies/search/export/{id}/results': (c) => c.companies.searchExport.results(UUID),
  'GET /v2/people/search/export/{id}/results': (c) => c.people.searchExport.results(UUID),
  'GET /v2/companies/workforce': (c) => c.companies.workforce({ domain: 'stripe.com' }),
  'POST /v2/companies/search': (c) => c.companies.search({ pageSize: 1 }),
  'POST /v2/companies/search/count': (c) => c.companies.count(),
  'POST /v2/companies/search/preview': (c) => c.companies.preview(),
  'POST /v2/people/search': (c) => c.people.search({ pageSize: 1 }),
  'POST /v2/people/search/count': (c) => c.people.count(),
  'POST /v2/people/search/preview': (c) => c.people.preview(),
  'GET /v2/industries': (c) => c.industries.list(),
  'GET /v2/keywords/autocomplete': (c) => c.keywords.autocomplete('saas'),
  'GET /v2/technologies/autocomplete': (c) => c.technologies.autocomplete('react'),
  'GET /v2/positions/autocomplete': (c) => c.positions.autocomplete('cto'),
  'GET /v2/me': (c) => c.me(),
  'GET /v2/batches': (c) => c.batches.list({ pageSize: 5 }),
  'GET /v2/batches/{id}': (c) => c.batches.get(UUID),
  'POST /v2/batches/{id}/cancel': (c) => c.batches.cancel(UUID),
  'GET /v2/batches/{id}/results': (c) => c.batches.rawResults(UUID),
  'GET /v2/people/{personId}': (c) => c.people.get(42),
  'POST /v2/people/enrich': (c) => c.people.enrich({ email: 'a@b.co' }),
  'GET /v2/people/{personId}/email': (c) => c.people.findEmail(42),
  'GET /v2/geo/regions': (c) => c.geo.regions(),
  'GET /v2/geo/countries/{countryCode}': (c) => c.geo.country('US'),
  'POST /v2/geo/countries': (c) => c.geo.searchCountries({ query: 'uni' }),
  'POST /v2/geo/states': (c) => c.geo.searchStates({ query: 'cal' }),
  'POST /v2/geo/cities': (c) => c.geo.searchCities({ query: 'par' }),
};

describe('OpenAPI coverage', () => {
  const spec = JSON.parse(readFileSync('openapi/v2.json', 'utf8')) as {
    paths: Record<string, Record<string, unknown>>;
  };
  const specOperations = Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.keys(item)
      .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
      .map((method) => `${method.toUpperCase()} ${path}`),
  );

  it('maps every operation in the spec, and nothing else', () => {
    expect(Object.keys(operations).sort()).toEqual([...specOperations].sort());
  });

  it.each(Object.entries(operations))('%s', async (operation, invoke) => {
    const [method, template] = operation.split(' ') as [string, string];
    const { client, fetch } = clientWith([json({ items: [] })]);
    const result = invoke(client);
    if (Symbol.asyncIterator in result) {
      await collect(result);
    } else {
      await result;
    }
    const { url, init } = requestOf(fetch);
    const pattern = new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`);
    expect(init.method).toBe(method);
    expect(url.pathname).toMatch(pattern);
    expect(url.pathname).not.toContain('{');
  });
});

describe('pagination', () => {
  it('walks every page, forwarding the cursor and the original params', async () => {
    const { client, fetch } = clientWith([
      json({ items: [{ id: '1' }, { id: '2' }], nextCursor: 'c2' }),
      json({ items: [{ id: '3' }], nextCursor: 'c3' }),
      json({ items: [{ id: '4' }] }),
    ]);
    const items = await collect(client.companies.searchAll({ pageSize: 2 }));
    expect(items.map((item) => item.id)).toEqual(['1', '2', '3', '4']);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(requestOf(fetch, 0).init.body as string)).toEqual({ pageSize: 2 });
    expect(JSON.parse(requestOf(fetch, 1).init.body as string)).toEqual({
      pageSize: 2,
      cursor: 'c2',
    });
    expect(JSON.parse(requestOf(fetch, 2).init.body as string)).toEqual({
      pageSize: 2,
      cursor: 'c3',
    });
  });

  it('does not fetch another page after the caller stops', async () => {
    const { client, fetch } = clientWith([
      json({ items: [{ id: 1 }, { id: 2 }], nextCursor: 'c2' }),
    ]);
    for await (const person of client.people.searchAll({ pageSize: 2 })) {
      expect(person.id).toBe(1);
      break;
    }
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('starts from a caller-supplied cursor', async () => {
    const { client, fetch } = clientWith([json({ items: [] })]);
    await collect(client.geo.searchCitiesAll({ cursor: 'resume' }));
    expect(JSON.parse(requestOf(fetch).init.body as string)).toEqual({ cursor: 'resume' });
  });

  it('paginates batches through the query string', async () => {
    const { client, fetch } = clientWith([
      json({ items: [{ id: 'a' }], nextCursor: 'next' }),
      json({ items: [{ id: 'b' }] }),
    ]);
    const batches = await collect(client.batches.listAll({ kind: 'company-enrichment' }));
    expect(batches.map((batch) => batch.id)).toEqual(['a', 'b']);
    const second = requestOf(fetch, 1).url.searchParams;
    expect(second.get('cursor')).toBe('next');
    expect(second.get('kind')).toBe('company-enrichment');
  });

  it('surfaces a failure on a later page', async () => {
    const { client } = clientWith([
      json({ items: [{ id: '1' }], nextCursor: 'c2' }),
      problem(404),
    ]);
    await expect(collect(client.companies.searchAll())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('batch results', () => {
  it('selects the download format and forwards the signature', async () => {
    const { client, fetch } = clientWith([json({ results: [] })]);
    await client.companies.searchExport.results(UUID, { sig: 'abc' });
    const { url } = requestOf(fetch);
    expect(url.pathname).toBe(`/v2/companies/search/export/${UUID}/results`);
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('sig')).toBe('abc');
  });

  it('streams NDJSON records across arbitrary chunk boundaries', async () => {
    const encoded = new TextEncoder().encode('{"index":0,"domain":"café.com"}\n{"index":1');
    const splitInsideMultibyte = encoded.indexOf(0xc3) + 1;
    const { client, fetch } = clientWith([
      ndjsonBody(
        encoded.slice(0, splitInsideMultibyte),
        encoded.slice(splitInsideMultibyte),
        ',"domain":"b.com"}\r\n\n{"index":2,"domain":"c.com"}',
      ),
    ]);
    const records = await collect(client.companies.bulkEnrichment.stream(UUID));
    expect(records.map((record) => record.domain)).toEqual(['café.com', 'b.com', 'c.com']);
    expect(requestOf(fetch).url.searchParams.get('format')).toBe('ndjson');
    expect(requestOf(fetch).headers.get('accept')).toBe('*/*');
  });

  it('cancels the download when the caller stops early', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('{"index":0}\n'));
      },
      cancel,
    });
    const { client } = clientWith([new Response(body)]);
    for await (const record of client.people.searchExport.stream(UUID)) {
      expect(record.index).toBe(0);
      break;
    }
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('returns the CSV response for the caller to read', async () => {
    const { client, fetch } = clientWith([new Response('index,domain\n0,a.com\n')]);
    const response = await client.companies.bulkEnrichment.csv(UUID);
    await expect(response.text()).resolves.toBe('index,domain\n0,a.com\n');
    expect(requestOf(fetch).url.searchParams.get('format')).toBe('csv');
  });

  it('throws the API error instead of streaming a failed response', async () => {
    const { client } = clientWith([problem(404, { title: 'Not Found' })]);
    await expect(collect(client.batches.rawResults(UUID))).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('batches.waitForCompletion', () => {
  const status = (value: string) => json({ id: UUID, status: value });

  it('polls until the batch reaches a terminal state', async () => {
    const { client, fetch } = clientWith([status('pending'), status('running'), status('completed')]);
    const seen: string[] = [];
    const batch = await client.batches.waitForCompletion(UUID, {
      pollIntervalMs: 1,
      onProgress: (update) => seen.push(update.status as string),
    });
    expect(batch.status).toBe('completed');
    expect(seen).toEqual(['pending', 'running', 'completed']);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('treats cancelling as unfinished and cancelled as finished', async () => {
    const { client } = clientWith([status('cancelling'), status('cancelled')]);
    const batch = await client.batches.waitForCompletion(UUID, { pollIntervalMs: 1 });
    expect(batch.status).toBe('cancelled');
  });

  it('throws TimeoutError when the deadline passes', async () => {
    const fetch = vi.fn(async () => status('running'));
    const client = new CompanyEnrich({
      apiKey: 'k',
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    await expect(
      client.batches.waitForCompletion(UUID, { pollIntervalMs: 1, timeoutMs: 15 }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('stops polling when aborted', async () => {
    const fetch = vi.fn(async () => status('running'));
    const client = new CompanyEnrich({
      apiKey: 'k',
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    const controller = new AbortController();
    const reason = new Error('stop');
    const pending = client.batches.waitForCompletion(UUID, {
      pollIntervalMs: 60_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(reason), 5);
    await expect(pending).rejects.toBe(reason);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('types', () => {
  it('exposes precise request and response types', () => {
    const client = new CompanyEnrich({ apiKey: 'k', fetch: vi.fn() });
    expectTypeOf(client.companies.enrich).returns.resolves.toEqualTypeOf<Company>();
    expectTypeOf(client.people.findEmail).returns.resolves.toEqualTypeOf<PersonEmail>();
    expectTypeOf(client.batches.get).returns.resolves.toEqualTypeOf<BatchStatus>();
    expectTypeOf<CompanyBulkEnrichmentResult['company']>().toEqualTypeOf<
      Company | null | undefined
    >();

    // @ts-expect-error `domain` is required
    const missingDomain = () => client.companies.enrich({});
    // @ts-expect-error `id` and `domain` are mutually exclusive
    const both: CompanyWorkforceParams = { id: UUID, domain: 'a.com' };
    // @ts-expect-error `expand` values come from the spec
    const badExpand = () => client.companies.enrich({ domain: 'a.com', expand: ['nope'] });
    expect([missingDomain, both, badExpand]).toHaveLength(3);
  });
});
