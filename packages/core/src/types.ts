import { inspect, types } from 'node:util';

export function getErrorName(v: unknown): string {
  if (types.isNativeError(v)) {
    return v.name;
  }
  return 'Error';
}

export function getErrorStack(v: unknown): string {
  if (types.isNativeError(v)) {
    // Use util.inspect to get the formatted error with source maps applied.
    // Accessing err.stack directly returns the raw stack without source map resolution.
    return inspect(v);
  }
  return '';
}
