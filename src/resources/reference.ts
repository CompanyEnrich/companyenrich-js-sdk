import type { HttpClient, RequestOptions } from '../core/http.js';
import type { AutocompleteResponse, IndustryList } from '../types.js';

export class Industries {
  constructor(private readonly http: HttpClient) {}

  /** Lists all industries and their NAICS code prefixes. Free. */
  list(options?: RequestOptions): Promise<IndustryList> {
    return this.http.request({ method: 'GET', path: '/v2/industries', options });
  }
}

/** Suggests up to 10 values for a search filter, ordered by popularity. Free. */
export class Autocomplete {
  constructor(
    private readonly http: HttpClient,
    private readonly path: string,
  ) {}

  autocomplete(query: string, options?: RequestOptions): Promise<AutocompleteResponse> {
    return this.http.request({ method: 'GET', path: this.path, query: { query }, options });
  }
}
