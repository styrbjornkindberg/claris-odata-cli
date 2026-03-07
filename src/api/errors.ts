/**
 * OData Error Types
 *
 * Custom error classes for OData API operations.
 *
 * @module api/errors
 */

/**
 * Base OData error class
 *
 * Wraps errors from the FileMaker OData API with additional context.
 */
export class ODataError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = 'ODataError';
  }
}

/**
 * Authentication error
 *
 * Thrown when credentials are invalid or expired.
 */
export class AuthenticationError extends ODataError {
  constructor(message: string = 'Authentication failed', response?: unknown) {
    super(message, 401, response);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error
 *
 * Thrown when the user lacks permission for the requested operation.
 */
export class AuthorizationError extends ODataError {
  constructor(message: string = 'Permission denied', response?: unknown) {
    super(message, 403, response);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not found error
 *
 * Thrown when the requested resource does not exist.
 */
export class NotFoundError extends ODataError {
  constructor(resource: string, response?: unknown) {
    super(`${resource} not found`, 404, response);
    this.name = 'NotFoundError';
  }
}

/**
 * Rate limit error
 *
 * Thrown when the rate limit has been exceeded.
 */
export class RateLimitError extends ODataError {
  constructor(
    message: string = 'Rate limit exceeded',
    public readonly retryAfter?: number,
    response?: unknown
  ) {
    super(message, 429, response);
    this.name = 'RateLimitError';
  }
}

/**
 * Validation error
 *
 * Thrown when the request data fails validation.
 */
export class ValidationError extends ODataError {
  constructor(message: string, response?: unknown) {
    super(message, 400, response);
    this.name = 'ValidationError';
  }
}