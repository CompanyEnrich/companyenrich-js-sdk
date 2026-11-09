import type { HttpClient, RequestOptions } from '../core/http.js';
import { paginate, withCursor } from '../core/streaming.js';
import type {
  Company,
  CompanyAutocompleteResponse,
  CompanyBulkEnrichmentParams,
  CompanyBulkEnrichmentResult,
  CompanyBulkEnrichmentResults,
  CompanySearchCount,
  CompanySearchExportParams,
  CompanySearchExportResult,
  CompanySearchExportResults,
  CompanySearchParams,
  CompanySearchPreview,
  CompanySearchQuery,
  CompanySearchResponse,
  CompanyWorkforce,
  CompanyWorkforceParams,
  EnrichCompaniesBatchParams,
  EnrichCompaniesBatchResponse,
  EnrichCompanyByPropertiesParams,
  EnrichCompanyParams,
  GetCompanyParams,
} from '../types.js';
import { BatchJob } from './batch-job.js';

export class Companies {
  /** Asynchronous enrichment of up to 10,000 domains. */
  readonly bulkEnrichment: BatchJob<
    CompanyBulkEnrichmentParams,
    CompanyBulkEnrichmentResults,
    CompanyBulkEnrichmentResult
  >;
  /** Asynchronous export of a company search. */
  readonly searchExport: BatchJob<
    CompanySearchExportParams,
    CompanySearchExportResults,
    CompanySearchExportResult
  >;

  constructor(private readonly http: HttpClient) {
    this.bulkEnrichment = new BatchJob(http, '/v2/companies/enrich/bulk');
    this.searchExport = new BatchJob(http, '/v2/companies/search/export');
  }

  /** Retrieves a stored company by its CompanyEnrich ID. */
  get(companyId: string, params?: GetCompanyParams, options?: RequestOptions): Promise<Company> {
    return this.http.request({
      method: 'GET',
      path: `/v2/companies/${encodeURIComponent(companyId)}`,
      query: params,
      options,
    });
  }

  /** Enriches a company by domain. Throws `NotFoundError` when there is no match. */
  enrich(params: EnrichCompanyParams, options?: RequestOptions): Promise<Company> {
    return this.http.request({ method: 'GET', path: '/v2/companies/enrich', query: params, options });
  }

  /** Enriches a company from identifying properties such as its name or LinkedIn URL. */
  enrichByProperties(
    params: EnrichCompanyByPropertiesParams,
    options?: RequestOptions,
  ): Promise<Company> {
    return this.http.request({ method: 'POST', path: '/v2/companies/enrich', body: params, options });
  }

  /** Enriches up to 50 domains in one request. */
  enrichBatch(
    params: EnrichCompaniesBatchParams,
    options?: RequestOptions,
  ): Promise<EnrichCompaniesBatchResponse> {
    return this.http.request({
      method: 'POST',
      path: '/v2/companies/enrich/batch',
      body: params,
      options,
    });
  }

  /** Suggests up to 10 companies whose domain matches `query`. */
  autocomplete(query: string, options?: RequestOptions): Promise<CompanyAutocompleteResponse> {
    return this.http.request({
      method: 'GET',
      path: '/v2/companies/autocomplete',
      query: { query },
      options,
    });
  }

  /** Retrieves workforce insights. Pass `nextCursor` as `cursor` to go back another 12 months. */
  workforce(params: CompanyWorkforceParams, options?: RequestOptions): Promise<CompanyWorkforce> {
    return this.http.request({
      method: 'GET',
      path: '/v2/companies/workforce',
      query: params,
      options,
    });
  }

  /** Returns one page of companies matching filters, a semantic query, or lookalike seeds. */
  search(params: CompanySearchParams = {}, options?: RequestOptions): Promise<CompanySearchResponse> {
    return this.http.request({ method: 'POST', path: '/v2/companies/search', body: params, options });
  }

  /**
   * Iterates over every matching company, fetching pages as needed.
   * Credits are charged per page, so set `pageSize` close to what you will consume.
   */
  searchAll(
    params: CompanySearchParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<Company, void, undefined> {
    return paginate(
      (cursor) => this.search(withCursor(params, cursor), options),
      params.cursor,
    );
  }

  /** Counts matching companies. Free. */
  count(params: CompanySearchQuery = {}, options?: RequestOptions): Promise<CompanySearchCount> {
    return this.http.request({
      method: 'POST',
      path: '/v2/companies/search/count',
      body: params,
      retrySafe: true,
      options,
    });
  }

  /** Returns up to 25 company summaries. Free, but requires a plan with previews. */
  preview(params: CompanySearchQuery = {}, options?: RequestOptions): Promise<CompanySearchPreview> {
    return this.http.request({
      method: 'POST',
      path: '/v2/companies/search/preview',
      body: params,
      retrySafe: true,
      options,
    });
  }
}
