import type { HttpClient, RequestOptions } from '../core/http.js';
import { paginate, withCursor } from '../core/streaming.js';
import type {
  GeoCity,
  GeoCitySearchParams,
  GeoCitySearchResponse,
  GeoCountry,
  GeoCountrySearchResponse,
  GeoRegions,
  GeoSearchParams,
  GeoState,
  GeoStateSearchParams,
  GeoStateSearchResponse,
} from '../types.js';

/** Geographic reference data for search filters. Every endpoint here is free. */
export class Geo {
  constructor(private readonly http: HttpClient) {}

  /** Lists all regions and their country codes. */
  regions(options?: RequestOptions): Promise<GeoRegions> {
    return this.http.request({ method: 'GET', path: '/v2/geo/regions', options });
  }

  /** Retrieves a country by its two-letter code. */
  country(countryCode: string, options?: RequestOptions): Promise<GeoCountry> {
    return this.http.request({
      method: 'GET',
      path: `/v2/geo/countries/${encodeURIComponent(countryCode)}`,
      options,
    });
  }

  searchCountries(
    params: GeoSearchParams = {},
    options?: RequestOptions,
  ): Promise<GeoCountrySearchResponse> {
    return this.search('/v2/geo/countries', params, options);
  }

  searchCountriesAll(
    params: GeoSearchParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<GeoCountry, void, undefined> {
    return paginate(
      (cursor) => this.searchCountries(withCursor(params, cursor), options),
      params.cursor,
    );
  }

  searchStates(
    params: GeoStateSearchParams = {},
    options?: RequestOptions,
  ): Promise<GeoStateSearchResponse> {
    return this.search('/v2/geo/states', params, options);
  }

  searchStatesAll(
    params: GeoStateSearchParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<GeoState, void, undefined> {
    return paginate(
      (cursor) => this.searchStates(withCursor(params, cursor), options),
      params.cursor,
    );
  }

  searchCities(
    params: GeoCitySearchParams = {},
    options?: RequestOptions,
  ): Promise<GeoCitySearchResponse> {
    return this.search('/v2/geo/cities', params, options);
  }

  searchCitiesAll(
    params: GeoCitySearchParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<GeoCity, void, undefined> {
    return paginate(
      (cursor) => this.searchCities(withCursor(params, cursor), options),
      params.cursor,
    );
  }

  private search<T>(path: string, body: object, options?: RequestOptions): Promise<T> {
    return this.http.request({ method: 'POST', path, body, retrySafe: true, options });
  }
}
