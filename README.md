# CompanyEnrich JavaScript SDK

[![npm](https://img.shields.io/npm/v/@companyenrich/sdk)](https://www.npmjs.com/package/@companyenrich/sdk)

The official TypeScript and JavaScript client for the [CompanyEnrich API](https://companyenrich.com): company and people enrichment, filter, semantic and lookalike search, work emails, and bulk jobs.

Types are generated from the [OpenAPI spec](https://api.companyenrich.com/openapi/v2.json) and the package has no runtime dependencies. It requires Node.js 20 or newer, or another runtime with a standard `fetch`.

## Install

```sh
npm install @companyenrich/sdk
```

## Quick start

Create an API key in your [dashboard](https://companyenrich.com/dashboard). Keep it on the server and never ship it in browser code.

```ts
import { CompanyEnrich } from '@companyenrich/sdk';

// Reads COMPANYENRICH_API_KEY from the environment, or pass { apiKey: '...' }.
const client = new CompanyEnrich();

const company = await client.companies.enrich({ domain: 'stripe.com' });
console.log(company.name, company.employees);
```

## Companies

```ts
// Add paid data to a lookup. Each expansion costs extra credits.
const detailed = await client.companies.enrich({
  domain: 'stripe.com',
  expand: ['technologies', 'workforce'],
});

// Up to 50 domains at once. Check each item's status.
const { items } = await client.companies.enrichBatch({ domains: ['stripe.com', 'adyen.com'] });
for (const item of items) {
  if (item.status === 'found') console.log(item.domain, item.company?.name);
}

// Filter search
const page = await client.companies.search({
  filter: { country: 'US', employees: ['51-200', '201-500'], categories: 'saas' },
  pageSize: 25,
});
console.log(page.items.length, page.nextCursor);

// Free count of the same query
const { count } = await client.companies.count({ filter: { country: 'US' } });
```

## People

```ts
const results = await client.people.search({
  filter: { domain: 'stripe.com', seniority: ['c-suite', 'founder'] },
  pageSize: 10,
});

const person = await client.people.enrich({ email: 'jane@stripe.com' });

const lookup = await client.people.findEmail(person.id, { domain: 'stripe.com' });
if (lookup.status === 'found') console.log(lookup.email, lookup.certainty);
```

## Semantic and lookalike search

Semantic search finds companies or people from a plain-language description. Lookalike search finds companies similar to ones you already know. A company search can use either mode but not both, and either can be combined with `filter`. `searchAll` accepts the same arguments as `search`.

| Search | Credits per result |
| --- | --- |
| Companies by filters | 1 |
| Companies by description | 2 |
| Lookalike companies | 5 |
| People, in any mode | 2 |

Paid expansions cost extra, and an empty result costs one result's base price. To try a query for free, pass the same arguments to `companies.preview()` or `people.preview()`, which need a plan with previews.

### Companies by description

By default, the API reads attributes such as location and size from your query and applies them. `interpretation` shows what it inferred.

```ts
const results = await client.companies.search({
  semantic: { query: 'saas companies in Turkey' },
  pageSize: 25,
});

for (const company of results.items) {
  console.log(company.domain, company.description);
}

console.log(results.interpretation?.filter); // Inferred filters, such as the country
console.log(results.interpretation?.boost); // Inferred ranking boosts, such as the category
```

Filters you pass take priority over inferred values of the same kind. Set `autoFilter: false` to turn inference off, or set `weight` (0 to 1) to control how much semantic similarity affects ranking.

```ts
const filtered = await client.companies.search({
  semantic: { query: 'AI tools for hospitals', autoFilter: false },
  filter: { country: 'US', employees: ['51-200', '201-500'] },
  pageSize: 25,
});
```

### Lookalike companies

Pass 1 to 10 seed domains. Use `minScore` (0 to 1) to require a minimum similarity.

```ts
const similar = await client.companies.search({
  lookalike: { domains: ['stripe.com', 'adyen.com'] },
  filter: { country: 'US', employees: ['51-200', '201-500'] },
  pageSize: 25,
});

for (const company of similar.items) {
  console.log(company.domain, similar.scores?.[company.id]); // Scores are not probabilities
}
```

Keep results in the order returned rather than sorting them by score.

### People by description

The API turns your query into person filters, such as role, seniority and country, plus a description of their current companies. `interpretation` shows both. A query it can't infer any filters from is rejected with an error, so include something concrete like a role or location.

```ts
const people = await client.people.search({
  semantic: { query: 'marketing leaders at Series B fintech startups in London' },
  pageSize: 25,
});

for (const person of people.items) {
  console.log(person.name, person.position);
}

console.log(people.interpretation); // The inferred filters and company description
```

### People at matching companies

Use `company` to find people by the kind of company they work at. These searches cover people at the 1,000 best-matching companies.

```ts
// Executives at companies matching a description
const executives = await client.people.search({
  filter: { seniority: ['c-suite', 'vp'] },
  company: { semantic: { query: 'AI tools for hospitals' } },
  pageSize: 25,
});

// Executives at companies similar to your best customers
const similarTeams = await client.people.search({
  filter: { seniority: ['c-suite', 'vp'] },
  company: { lookalike: { domains: ['stripe.com', 'adyen.com'] } },
  pageSize: 25,
});
```

## Pagination

`search()` returns one page. The `*All` methods return an async iterator that requests pages as you consume them.

```ts
for await (const company of client.companies.searchAll({
  filter: { country: 'TR' },
  pageSize: 100,
})) {
  console.log(company.domain);
}
```

These are available as `companies.searchAll`, `people.searchAll`, `batches.listAll`, and `geo.searchCountriesAll`, `geo.searchStatesAll` and `geo.searchCitiesAll`.

Search credits are charged for every result on a fetched page, even if you stop iterating partway through it. Set `pageSize` close to the number of results you plan to use.

## Bulk jobs

Bulk enrichment and search exports run in the background.

```ts
const job = await client.companies.bulkEnrichment.create({
  domains: ['stripe.com', 'adyen.com'],
});

await client.batches.waitForCompletion(job.id, {
  onProgress: ({ progress }) => console.log(`${progress.succeeded}/${progress.total}`),
});

for await (const record of client.companies.bulkEnrichment.stream(job.id)) {
  if (record.success) console.log(record.domain, record.company?.name);
}
```

`companies.bulkEnrichment`, `companies.searchExport` and `people.searchExport` share the same methods:

| Method | Returns |
| --- | --- |
| `create(params)` | The new batch's status |
| `stream(id)` | An async iterator of records, best for large jobs |
| `results(id)` | One JSON document with every record |
| `csv(id)` | A `Response` to read as text or pipe to a file |

## Errors

Failed requests throw a subclass of `ApiError`, which carries `status`, `title`, `detail`, `errors` (field-level validation messages) and `traceId` (include it when contacting support).

```ts
import { ApiError, NotFoundError, PaymentRequiredError } from '@companyenrich/sdk';

try {
  await client.companies.enrich({ domain: 'example.invalid' });
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('No company found');
  } else if (error instanceof PaymentRequiredError) {
    console.log('Out of credits, or not included in this plan');
  } else if (error instanceof ApiError) {
    console.error(error.status, error.detail, error.traceId);
  } else {
    throw error;
  }
}
```

| Status | Class |
| --- | --- |
| 400 | `BadRequestError` |
| 401 | `AuthenticationError` |
| 402 | `PaymentRequiredError` |
| 403 | `PermissionDeniedError` |
| 404 | `NotFoundError` |
| 422 | `ValidationError` |
| 429 | `RateLimitError` |
| 5xx | `ServerError` |
| Other | `ApiError` |

`ConnectionError` and `TimeoutError` cover requests that never received a response. Everything the SDK throws extends `CompanyEnrichError`, except that aborting your own `signal` rejects with that signal's reason.

## Retries and timeouts

Failed requests are retried up to twice with exponential backoff.

| Failure | GET and free POST endpoints | Other POST endpoints |
| --- | --- | --- |
| 429 rate limit | Retried | Retried |
| 408, 5xx, connection error, timeout | Retried | Not retried |

POST requests that consume credits or start a job are not repeated after an ambiguous failure, because the first attempt may already have been charged or created a batch.

## Configuration

```ts
const configured = new CompanyEnrich({
  apiKey: 'your-api-key',
  timeoutMs: 30_000,
  maxRetries: 4,
});

// Every method accepts request options as its last argument.
const controller = new AbortController();
await configured.me({ signal: controller.signal, timeoutMs: 5_000 });
```

| Option | Default | Description |
| --- | --- | --- |
| `apiKey` | `COMPANYENRICH_API_KEY` | Your API key |
| `baseUrl` | `https://api.companyenrich.com` | API origin, for proxies |
| `timeoutMs` | `120000` | Timeout per attempt. `0` disables it |
| `maxRetries` | `2` | Retries after the first attempt |
| `fetch` | global `fetch` | Custom `fetch` implementation |
| `defaultHeaders` | none | Headers added to every request |

## API reference

| SDK method | Endpoint |
| --- | --- |
| `companies.get(id, params?)` | `GET /v2/companies/{companyId}` |
| `companies.enrich(params)` | `GET /v2/companies/enrich` |
| `companies.enrichByProperties(params)` | `POST /v2/companies/enrich` |
| `companies.enrichBatch(params)` | `POST /v2/companies/enrich/batch` |
| `companies.autocomplete(query)` | `GET /v2/companies/autocomplete` |
| `companies.workforce(params)` | `GET /v2/companies/workforce` |
| `companies.search(params?)` | `POST /v2/companies/search` |
| `companies.count(params?)` | `POST /v2/companies/search/count` |
| `companies.preview(params?)` | `POST /v2/companies/search/preview` |
| `companies.bulkEnrichment.*` | `/v2/companies/enrich/bulk` |
| `companies.searchExport.*` | `/v2/companies/search/export` |
| `people.get(id, params?)` | `GET /v2/people/{personId}` |
| `people.enrich(params)` | `POST /v2/people/enrich` |
| `people.findEmail(id, params?)` | `GET /v2/people/{personId}/email` |
| `people.search(params?)` | `POST /v2/people/search` |
| `people.count(params?)` | `POST /v2/people/search/count` |
| `people.preview(params?)` | `POST /v2/people/search/preview` |
| `people.searchExport.*` | `/v2/people/search/export` |
| `batches.list(params?)` | `GET /v2/batches` |
| `batches.get(id)` | `GET /v2/batches/{id}` |
| `batches.cancel(id)` | `POST /v2/batches/{id}/cancel` |
| `batches.rawResults(id)` | `GET /v2/batches/{id}/results` |
| `batches.waitForCompletion(id, options?)` | Polls `GET /v2/batches/{id}` |
| `geo.regions()` | `GET /v2/geo/regions` |
| `geo.country(code)` | `GET /v2/geo/countries/{countryCode}` |
| `geo.searchCountries(params?)` | `POST /v2/geo/countries` |
| `geo.searchStates(params?)` | `POST /v2/geo/states` |
| `geo.searchCities(params?)` | `POST /v2/geo/cities` |
| `industries.list()` | `GET /v2/industries` |
| `keywords.autocomplete(query)` | `GET /v2/keywords/autocomplete` |
| `technologies.autocomplete(query)` | `GET /v2/technologies/autocomplete` |
| `positions.autocomplete(query)` | `GET /v2/positions/autocomplete` |
| `me()` | `GET /v2/me` |

See the [API documentation](https://api.companyenrich.com/openapi/v2.json) for parameters and credit costs. Request and response types are exported by name, for example `Company`, `Person` and `CompanySearchParams`. The raw generated `paths` and `components` types are exported too.

## Development

```sh
pnpm install
pnpm test
pnpm run update-spec  # Downloads the latest OpenAPI spec and regenerates types
```

To release, bump `version` in `package.json` and push to `main`. The publish workflow runs the checks and publishes that version to npm if it is new.

## License

MIT
