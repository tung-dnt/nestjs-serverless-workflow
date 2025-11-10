/**
 * Retry strategy types
 */
export enum RetryStrategy {
  FIXED = 'fixed',
  EXPONENTIAL = 'exponential',
  EXPONENTIAL_JITTER = 'exponential_jitter',
}

/**
 * Retry configuration for workflow steps
 */
export interface IBackoffRetryConfig {
  handler: string;
  maxAttempts: number;
  strategy?: RetryStrategy;
  initialDelay?: number; // milliseconds
  backoffMultiplier?: number; // default 2
  maxDelay?: number; // cap for exponential backoff
  jitter?: boolean | number; // true = full jitter, number = jitter percentage (0-1)
}

export interface IRetryHandler {
  execute: () => Promise<void>;
}
