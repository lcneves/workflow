import { WorkflowAPIError } from '@workflow/errors';
import type { World } from '@workflow/world';
import retry, { type Options as RetryOptions } from 'async-retry';

/**
 * Default retry options for World operations.
 *
 * We use a conservative retry strategy to handle transient failures:
 * - 3 retries (4 total attempts)
 * - Exponential backoff starting at 250ms
 * - Maximum delay of 5 seconds between retries
 * - Randomization to avoid thundering herd
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  retries: 3,
  minTimeout: 250,
  maxTimeout: 5000,
  factor: 2,
  randomize: true,
};

/**
 * Common retryable network error codes.
 */
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ECONNABORTED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/**
 * HTTP status codes that should trigger a retry.
 */
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * Determines if an error is retryable.
 *
 * We retry on:
 * - Network errors (fetch failures, timeouts)
 * - 5xx server errors
 * - 408 Request Timeout
 * - 429 Too Many Requests
 *
 * We do NOT retry on:
 * - 4xx client errors (except 408, 429)
 * - Business logic errors
 */
function isRetryableError(error: unknown): boolean {
  // WorkflowAPIError with status code - check if it's retryable
  if (WorkflowAPIError.is(error) && error.status !== undefined) {
    return RETRYABLE_STATUS_CODES.has(error.status);
  }

  // For non-WorkflowAPIError errors (network errors, etc.)
  if (error instanceof Error) {
    // Check for retryable network error codes
    const errorCode = (error as NodeJS.ErrnoException).code;
    if (errorCode && RETRYABLE_ERROR_CODES.has(errorCode)) {
      return true;
    }

    // Check for fetch-related errors or AbortError from timeouts
    if (
      (error.name === 'TypeError' && error.message.includes('fetch failed')) ||
      error.name === 'AbortError'
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Wraps an async function with retry logic.
 *
 * @param fn - The async function to wrap
 * @param options - Optional retry configuration
 * @returns The result of the function, or throws after all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  return retry(
    async (bail: (e: Error) => void) => {
      try {
        return await fn();
      } catch (error) {
        // If the error is not retryable, bail immediately
        if (!isRetryableError(error)) {
          bail(error as Error);
          // This return is never reached, but TypeScript requires it
          throw error;
        }
        // Otherwise, throw to trigger a retry
        throw error;
      }
    },
    {
      ...DEFAULT_RETRY_OPTIONS,
      ...options,
    }
  );
}

/**
 * Creates a proxy handler that wraps method calls with retry logic.
 */
function createRetryProxyHandler<T extends object>(): ProxyHandler<T> {
  return {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // If it's a function, wrap it with retry logic
      if (typeof value === 'function') {
        return function (this: unknown, ...args: unknown[]) {
          const result = value.apply(this === receiver ? target : this, args);
          // If the function returns a promise, wrap it with retry
          if (result instanceof Promise) {
            return withRetry(() =>
              value.apply(this === receiver ? target : this, args)
            );
          }
          return result;
        };
      }

      // If it's an object (like runs, steps, events, hooks), wrap it recursively
      if (value !== null && typeof value === 'object') {
        return new Proxy(value as object, createRetryProxyHandler());
      }

      return value;
    },
  };
}

/**
 * Wraps a World instance with automatic retry logic for all async operations.
 *
 * This creates a proxy around the World object that intercepts all method calls
 * and wraps them with retry logic. Nested objects (runs, steps, events, hooks)
 * are also proxied recursively.
 *
 * @param world - The World instance to wrap
 * @returns A World instance with retry logic applied to all methods
 */
export function wrapWorldWithRetry(world: World): World {
  return new Proxy(world, createRetryProxyHandler<World>());
}
