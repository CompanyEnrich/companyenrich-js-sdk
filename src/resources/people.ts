import type { HttpClient, RequestOptions } from '../core/http.js';
import { paginate, withCursor } from '../core/streaming.js';
import type {
  EnrichPersonParams,
  FindPersonEmailParams,
  GetPersonParams,
  Person,
  PersonEmail,
  PersonId,
  PersonSearchCount,
  PersonSearchExportParams,
  PersonSearchExportResult,
  PersonSearchExportResults,
  PersonSearchParams,
  PersonSearchPreview,
  PersonSearchQuery,
  PersonSearchResponse,
} from '../types.js';
import { BatchJob } from './batch-job.js';

export class People {
  /** Asynchronous export of a people search. */
  readonly searchExport: BatchJob<
    PersonSearchExportParams,
    PersonSearchExportResults,
    PersonSearchExportResult
  >;

  constructor(private readonly http: HttpClient) {
    this.searchExport = new BatchJob(http, '/v2/people/search/export');
  }

  /** Retrieves a person by their CompanyEnrich ID. */
  get(personId: PersonId, params?: GetPersonParams, options?: RequestOptions): Promise<Person> {
    return this.http.request({
      method: 'GET',
      path: `/v2/people/${encodeURIComponent(String(personId))}`,
      query: params,
      options,
    });
  }

  /** Identifies a person from an email address. Throws `NotFoundError` when there is no match. */
  enrich(params: EnrichPersonParams, options?: RequestOptions): Promise<Person> {
    return this.http.request({ method: 'POST', path: '/v2/people/enrich', body: params, options });
  }

  /** Finds a person's work email. Check `status` on the result: only `found` includes `email`. */
  findEmail(
    personId: PersonId,
    params?: FindPersonEmailParams,
    options?: RequestOptions,
  ): Promise<PersonEmail> {
    return this.http.request({
      method: 'GET',
      path: `/v2/people/${encodeURIComponent(String(personId))}/email`,
      query: params,
      options,
    });
  }

  /** Returns one page of people matching filters, a semantic query, or a company query. */
  search(params: PersonSearchParams = {}, options?: RequestOptions): Promise<PersonSearchResponse> {
    return this.http.request({ method: 'POST', path: '/v2/people/search', body: params, options });
  }

  /**
   * Iterates over every matching person, fetching pages as needed.
   * Credits are charged per page, so set `pageSize` close to what you will consume.
   */
  searchAll(
    params: PersonSearchParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<Person, void, undefined> {
    return paginate(
      (cursor) => this.search(withCursor(params, cursor), options),
      params.cursor,
    );
  }

  /** Counts matching people. Free. */
  count(params: PersonSearchQuery = {}, options?: RequestOptions): Promise<PersonSearchCount> {
    return this.http.request({
      method: 'POST',
      path: '/v2/people/search/count',
      body: params,
      retrySafe: true,
      options,
    });
  }

  /** Returns up to 10 person summaries. Free, but requires a plan with previews. */
  preview(params: PersonSearchQuery = {}, options?: RequestOptions): Promise<PersonSearchPreview> {
    return this.http.request({
      method: 'POST',
      path: '/v2/people/search/preview',
      body: params,
      retrySafe: true,
      options,
    });
  }
}
