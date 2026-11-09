/** RFC 9457 problem document returned by the API for every failed request. */
export interface ProblemDetails {
  type?: string | null;
  title?: string | null;
  status?: number | null;
  detail?: string | null;
  instance?: string | null;
  /** Field-level messages, present on `422` responses. */
  errors?: Record<string, string[]>;
}

/** Base class for every error thrown by this SDK. */
export class CompanyEnrichError extends Error {
  override name = 'CompanyEnrichError';
}

/** The request never produced a response, for example because of a DNS or socket failure. */
export class ConnectionError extends CompanyEnrichError {
  override name = 'ConnectionError';
}

/** The request, or a `batches.waitForCompletion` call, ran out of time. */
export class TimeoutError extends CompanyEnrichError {
  override name = 'TimeoutError';
}

export interface ApiErrorInit {
  status: number;
  headers: Headers;
  body: unknown;
}

/** The API responded with a non-2xx status. */
export class ApiError extends CompanyEnrichError {
  override name = 'ApiError';
  readonly status: number;
  readonly headers: Headers;
  /** The parsed response body, or the raw text if it was not JSON. */
  readonly body: unknown;
  readonly type: string | undefined;
  readonly title: string | undefined;
  readonly detail: string | undefined;
  readonly instance: string | undefined;
  /** Field-level validation messages, keyed by field name. */
  readonly errors: Record<string, string[]> | undefined;
  /** Value of the `x-trace-id` response header. Include it in support requests. */
  readonly traceId: string | undefined;

  constructor({ status, headers, body }: ApiErrorInit) {
    const problem: ProblemDetails = isRecord(body) ? body : {};
    super(formatMessage(status, problem));
    this.status = status;
    this.headers = headers;
    this.body = body;
    this.type = problem.type ?? undefined;
    this.title = problem.title ?? undefined;
    this.detail = problem.detail ?? undefined;
    this.instance = problem.instance ?? undefined;
    this.errors = problem.errors;
    this.traceId = headers.get('x-trace-id') ?? undefined;
  }
}

/** `400`: the request was malformed. */
export class BadRequestError extends ApiError {
  override name = 'BadRequestError';
}

/** `401`: the API key is missing or invalid. */
export class AuthenticationError extends ApiError {
  override name = 'AuthenticationError';
}

/** `402`: the account is out of credits or its plan does not include this request. */
export class PaymentRequiredError extends ApiError {
  override name = 'PaymentRequiredError';
}

/** `403`: the API key may not perform this request. */
export class PermissionDeniedError extends ApiError {
  override name = 'PermissionDeniedError';
}

/** `404`: the company, person, or batch does not exist. */
export class NotFoundError extends ApiError {
  override name = 'NotFoundError';
}

/** `422`: the request failed validation. See {@link ApiError.errors}. */
export class ValidationError extends ApiError {
  override name = 'ValidationError';
}

/** `429`: a rate limit was exceeded and automatic retries did not resolve it. */
export class RateLimitError extends ApiError {
  override name = 'RateLimitError';
}

/** `5xx`: the API failed to process the request. */
export class ServerError extends ApiError {
  override name = 'ServerError';
}

export function createApiError(init: ApiErrorInit): ApiError {
  switch (init.status) {
    case 400:
      return new BadRequestError(init);
    case 401:
      return new AuthenticationError(init);
    case 402:
      return new PaymentRequiredError(init);
    case 403:
      return new PermissionDeniedError(init);
    case 404:
      return new NotFoundError(init);
    case 422:
      return new ValidationError(init);
    case 429:
      return new RateLimitError(init);
    default:
      return init.status >= 500 ? new ServerError(init) : new ApiError(init);
  }
}

function formatMessage(status: number, problem: ProblemDetails): string {
  const summary = [problem.title, problem.detail].filter(Boolean).join(': ');
  const fields = Object.entries(problem.errors ?? {})
    .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
    .join('; ');
  return [`${status}`, summary, fields && `(${fields})`].filter(Boolean).join(' ');
}

function isRecord(value: unknown): value is Record<string, never> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
