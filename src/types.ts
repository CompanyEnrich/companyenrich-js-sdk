import type { components, paths } from './generated/openapi.js';

type Schemas = components['schemas'];
type QueryOf<P extends keyof paths> = paths[P] extends {
  get: { parameters: { query?: infer Query } };
}
  ? NonNullable<Query>
  : never;

// Companies

export type Company = Schemas['CompanyResponse'];
export type CompanyExpansion = NonNullable<Schemas['CompanySearchV2Request']['expand']>[number];
export type GetCompanyParams = QueryOf<'/v2/companies/{companyId}'>;
export type EnrichCompanyParams = QueryOf<'/v2/companies/enrich'>;
export type EnrichCompanyByPropertiesParams = Schemas['CompanyEnrichV2Request'];
export type EnrichCompaniesBatchParams = Schemas['CompanyBatchEnrichV2Request'];
export type EnrichCompaniesBatchResponse = Schemas['CompanyBatchEnrichV2Response'];
export type CompanyBatchEnrichItem = Schemas['CompanyBatchEnrichItemResponse'];
export type CompanyEnrichStatus = Schemas['CompanyEnrichStatus'];
export type CompanyAutocompleteResponse = Schemas['SupportListResponseOfCompanyAutocompleteResponse'];
export type CompanyWorkforce = Schemas['CompanyWorkforceResponse2'];
/** Provide exactly one of `id` or `domain`. */
export type CompanyWorkforceParams = (
  | { id: string; domain?: never }
  | { domain: string; id?: never }
) & { cursor?: string };

export type CompanySearchParams = Schemas['CompanySearchV2Request'];
export type CompanySearchResponse = Schemas['CompanySearchV2Response'];
export type CompanySearchQuery = Schemas['CompanySearchQuery2'];
export type CompanySearchCount = Schemas['CompanySearchCountV2Response'];
export type CompanySearchPreview = Schemas['CompanySearchPreviewV2Response'];

export type CompanyBulkEnrichmentParams = Schemas['CompanyBulkEnrichmentRequest'];
export type CompanyBulkEnrichmentResult = Omit<
  Schemas['CompanyBulkEnrichmentResult'],
  'company'
> & { company?: Company | null };
export type CompanyBulkEnrichmentResults = Omit<
  Schemas['CompanyBulkEnrichmentResultsResponse'],
  'results'
> & { results: CompanyBulkEnrichmentResult[] };

export type CompanySearchExportParams = Schemas['CompanySearchExportRequest'];
export type CompanySearchExportResult = Omit<Schemas['CompanySearchExportResult'], 'company'> & {
  company: Company;
};
export type CompanySearchExportResults = Omit<
  Schemas['CompanySearchExportResultsResponse'],
  'results'
> & { results: CompanySearchExportResult[] };

// People

export type Person = Schemas['PersonResponse'];
/** Person IDs are 64-bit integers. Pass a string or bigint for values above `Number.MAX_SAFE_INTEGER`. */
export type PersonId = number | string | bigint;
export type PersonExpansion = NonNullable<Schemas['PersonSearchV2Request']['expand']>[number];
export type GetPersonParams = QueryOf<'/v2/people/{personId}'>;
export type EnrichPersonParams = Schemas['PersonEnrichV2Request'];
export type FindPersonEmailParams = QueryOf<'/v2/people/{personId}/email'>;
export type PersonEmail = Schemas['PersonEmailV2Response'];
export type PersonEmailLookupStatus = Schemas['PersonEmailLookupStatus'];

export type PersonSearchParams = Schemas['PersonSearchV2Request'];
export type PersonSearchResponse = Schemas['PersonSearchV2Response'];
export type PersonSearchQuery = Schemas['PersonSearchQuery'];
export type PersonSearchCount = Schemas['PersonSearchCountV2Response'];
export type PersonSearchPreview = Schemas['PersonSearchPreviewV2Response'];

export type PersonSearchExportParams = Schemas['PersonSearchExportRequest'];
export type PersonSearchExportResult = Omit<Schemas['PersonSearchExportResult'], 'person'> & {
  person: Person;
};
export type PersonSearchExportResults = Omit<
  Schemas['PersonSearchExportResultsResponse'],
  'results'
> & { results: PersonSearchExportResult[] };

// Batches

export type BatchStatus = Schemas['BatchStatusResponse'];
export type BatchState = Schemas['HttpBatchState'];
export type BatchProgress = Schemas['BatchProgressResponse'];
export type BatchList = Schemas['BatchListResponse'];
export type ListBatchesParams = QueryOf<'/v2/batches'>;
export type BatchRawResult = Schemas['BatchRawResultResponse'];
export interface BatchResultsParams {
  /** Signature taken from a signed results URL. Not needed when using your API key. */
  sig?: string;
}

// Geo

export type GeoRegion = Schemas['GeoRegionResponse'];
export type GeoRegions = Schemas['SupportListResponseOfGeoRegionResponse'];
export type GeoCountry = Schemas['GeoCountryResponse'];
export type GeoState = Schemas['GeoStateResponse'];
export type GeoCity = Schemas['GeoCityResponse'];
export type GeoSearchParams = Schemas['GeoSearchRequest'];
export type GeoStateSearchParams = Schemas['GeoStateSearchRequest'];
export type GeoCitySearchParams = Schemas['GeoCitySearchRequest'];
export type GeoCountrySearchResponse = Schemas['GeoSearchResponseOfGeoCountryResponse'];
export type GeoStateSearchResponse = Schemas['GeoSearchResponseOfGeoStateResponse'];
export type GeoCitySearchResponse = Schemas['GeoSearchResponseOfGeoCityResponse'];

// Reference data and account

export type Industry = Schemas['IndustryResponse'];
export type IndustryList = Schemas['SupportListResponseOfIndustryResponse'];
export type AutocompleteResponse = Schemas['SupportListResponseOfstring'];
export type CurrentUser = Schemas['ApiUserV2Info'];
