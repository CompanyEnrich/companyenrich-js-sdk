import { TimeoutError } from '../core/errors.js';
import { sleep, type HttpClient, type RequestOptions } from '../core/http.js';
import { paginate, streamNdjson, withCursor } from '../core/streaming.js';
import type {
  BatchList,
  BatchRawResult,
  BatchResultsParams,
  BatchStatus,
  ListBatchesParams,
} from '../types.js';

const DEFAULT_POLL_INTERVAL_MS = 2_000;

export interface WaitForCompletionOptions {
  /** Delay between status checks. Defaults to 2000. */
  pollIntervalMs?: number;
  /** Throws `TimeoutError` if the batch has not finished after this long. Waits indefinitely by default. */
  timeoutMs?: number;
  /** Called with the latest status after every check. */
  onProgress?: (batch: BatchStatus) => void;
  signal?: AbortSignal;
}

export class Batches {
  constructor(private readonly http: HttpClient) {}

  /** Returns one page of your batches, newest first. */
  list(params?: ListBatchesParams, options?: RequestOptions): Promise<BatchList> {
    return this.http.request({ method: 'GET', path: '/v2/batches', query: params, options });
  }

  /** Iterates over all of your batches, newest first. */
  listAll(
    params: ListBatchesParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<BatchStatus, void, undefined> {
    return paginate((cursor) => this.list(withCursor(params, cursor), options), params.cursor);
  }

  /** Retrieves a batch's status and progress. */
  get(batchId: string, options?: RequestOptions): Promise<BatchStatus> {
    return this.http.request({
      method: 'GET',
      path: `/v2/batches/${encodeURIComponent(batchId)}`,
      options,
    });
  }

  /** Stops remaining work. Results that were already charged stay downloadable. */
  cancel(batchId: string, options?: RequestOptions): Promise<BatchStatus> {
    return this.http.request({
      method: 'POST',
      path: `/v2/batches/${encodeURIComponent(batchId)}/cancel`,
      retrySafe: true,
      options,
    });
  }

  /** Streams the raw HTTP outcome of each request in the batch. */
  rawResults(
    batchId: string,
    params?: BatchResultsParams,
    options?: RequestOptions,
  ): AsyncGenerator<BatchRawResult, void, undefined> {
    return streamNdjson(this.http, {
      method: 'GET',
      path: `/v2/batches/${encodeURIComponent(batchId)}/results`,
      query: { sig: params?.sig },
      options,
    });
  }

  /** Polls until the batch is `completed` or `cancelled`, then returns its final status. */
  async waitForCompletion(
    batchId: string,
    { pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, timeoutMs, onProgress, signal }: WaitForCompletionOptions = {},
  ): Promise<BatchStatus> {
    const deadline = timeoutMs === undefined ? Infinity : Date.now() + timeoutMs;
    for (;;) {
      const batch = await this.get(batchId, signal ? { signal } : undefined);
      onProgress?.(batch);
      if (batch.status === 'completed' || batch.status === 'cancelled') {
        return batch;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new TimeoutError(`Batch ${batchId} did not finish within ${timeoutMs} ms`);
      }
      await sleep(Math.min(pollIntervalMs, remaining), signal);
    }
  }
}
