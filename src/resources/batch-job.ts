import type { HttpClient, HttpRequest, RequestOptions } from '../core/http.js';
import { streamNdjson } from '../core/streaming.js';
import type { BatchResultsParams, BatchStatus } from '../types.js';

/** An asynchronous job: create it, wait with `batches.waitForCompletion`, then download its results. */
export class BatchJob<CreateParams, Results, ResultRecord> {
  constructor(
    private readonly http: HttpClient,
    private readonly path: string,
  ) {}

  /** Starts the job. It runs in the background and consumes credits as it progresses. */
  create(params: CreateParams, options?: RequestOptions): Promise<BatchStatus> {
    return this.http.request({ method: 'POST', path: this.path, body: params, options });
  }

  /** Downloads every settled record as one JSON document. */
  results(
    batchId: string,
    params?: BatchResultsParams,
    options?: RequestOptions,
  ): Promise<Results> {
    return this.http.request(this.resultsRequest(batchId, 'json', params, options));
  }

  /** Streams settled records one at a time. Prefer this for large jobs. */
  stream(
    batchId: string,
    params?: BatchResultsParams,
    options?: RequestOptions,
  ): AsyncGenerator<ResultRecord, void, undefined> {
    return streamNdjson(this.http, this.resultsRequest(batchId, 'ndjson', params, options));
  }

  /** Requests the CSV download. Read it with `response.text()` or pipe `response.body` to a file. */
  async csv(
    batchId: string,
    params?: BatchResultsParams,
    options?: RequestOptions,
  ): Promise<Response> {
    const { response } = await this.http.stream(
      this.resultsRequest(batchId, 'csv', params, options),
    );
    return response;
  }

  private resultsRequest(
    batchId: string,
    format: 'json' | 'ndjson' | 'csv',
    params: BatchResultsParams | undefined,
    options: RequestOptions | undefined,
  ): HttpRequest {
    return {
      method: 'GET',
      path: `${this.path}/${encodeURIComponent(batchId)}/results`,
      query: { format, sig: params?.sig },
      options,
    };
  }
}
