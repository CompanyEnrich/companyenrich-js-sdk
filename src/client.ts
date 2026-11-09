import { HttpClient, type ClientOptions, type RequestOptions } from './core/http.js';
import { Batches } from './resources/batches.js';
import { Companies } from './resources/companies.js';
import { Geo } from './resources/geo.js';
import { People } from './resources/people.js';
import { Autocomplete, Industries } from './resources/reference.js';
import type { CurrentUser } from './types.js';

export class CompanyEnrich {
  readonly companies: Companies;
  readonly people: People;
  readonly batches: Batches;
  readonly geo: Geo;
  readonly industries: Industries;
  readonly keywords: Autocomplete;
  readonly technologies: Autocomplete;
  readonly positions: Autocomplete;

  private readonly http: HttpClient;

  constructor(options: ClientOptions = {}) {
    this.http = new HttpClient(options);
    this.companies = new Companies(this.http);
    this.people = new People(this.http);
    this.batches = new Batches(this.http);
    this.geo = new Geo(this.http);
    this.industries = new Industries(this.http);
    this.keywords = new Autocomplete(this.http, '/v2/keywords/autocomplete');
    this.technologies = new Autocomplete(this.http, '/v2/technologies/autocomplete');
    this.positions = new Autocomplete(this.http, '/v2/positions/autocomplete');
  }

  /** Returns the authenticated user, including credit balance and plan capabilities. Free. */
  me(options?: RequestOptions): Promise<CurrentUser> {
    return this.http.request({ method: 'GET', path: '/v2/me', options });
  }
}
