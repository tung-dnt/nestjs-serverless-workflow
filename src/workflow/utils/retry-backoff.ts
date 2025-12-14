import { RetryStrategy, type IBackoffRetryConfig } from '../types';

/**
 * Calculate delay for retry attempt using exponential backoff with optional jitter
 */
export class RetryBackoff {
  /**
   * Calculate delay based on retry strategy
   * @param attempt Current attempt number (0-indexed)
   * @param config Retry configuration
   * @returns Delay in milliseconds
   */
  static calculateDelay(attempt: number, config: IBackoffRetryConfig): number {
    const {
      strategy = RetryStrategy.EXPONENTIAL_JITTER,
      initialDelay = 1000,
      backoffMultiplier = 2,
      maxDelay = 60000,
      jitter = true,
    } = config;

    switch (strategy) {
      case RetryStrategy.FIXED:
        return this.fixedDelay(initialDelay);

      case RetryStrategy.EXPONENTIAL:
        return this.exponentialBackoff(attempt, initialDelay, backoffMultiplier, maxDelay);

      case RetryStrategy.EXPONENTIAL_JITTER:
        return this.exponentialBackoffWithJitter(attempt, initialDelay, backoffMultiplier, maxDelay, jitter);

      default:
        return this.exponentialBackoffWithJitter(attempt, initialDelay, backoffMultiplier, maxDelay, jitter);
    }
  }

  /**
   * Fixed delay - always returns the same delay
   */
  private static fixedDelay(delay: number): number {
    return delay;
  }

  /**
   * Exponential backoff without jitter
   * delay = min(initialDelay * (backoffMultiplier ^ attempt), maxDelay)
   */
  private static exponentialBackoff(
    attempt: number,
    initialDelay: number,
    backoffMultiplier: number,
    maxDelay: number,
  ): number {
    const delay = initialDelay * Math.pow(backoffMultiplier, attempt);
    return Math.min(delay, maxDelay);
  }

  /**
   * Exponential backoff with jitter (AWS recommended approach)
   * Uses "Full Jitter" strategy: delay = random(0, min(maxDelay, baseDelay * 2^attempt))
   *
   * Or partial jitter: delay = baseDelay + random(0, jitterAmount)
   */
  private static exponentialBackoffWithJitter(
    attempt: number,
    initialDelay: number,
    backoffMultiplier: number,
    maxDelay: number,
    jitter: boolean | number,
  ): number {
    const baseDelay = this.exponentialBackoff(attempt, initialDelay, backoffMultiplier, maxDelay);

    if (jitter === true) {
      // Full jitter: random between 0 and baseDelay
      return Math.random() * baseDelay;
    } else if (typeof jitter === 'number') {
      // Partial jitter: baseDelay ± (jitter percentage)
      const jitterAmount = baseDelay * jitter;
      return baseDelay - jitterAmount + Math.random() * jitterAmount * 2;
    }

    return baseDelay;
  }

  /**
   * Alternative: Decorrelated jitter (more aggressive)
   * delay = random(initialDelay, previousDelay * 3)
   */
  static decorrelatedJitter(previousDelay: number, initialDelay: number, maxDelay: number): number {
    const min = initialDelay;
    const max = Math.min(previousDelay * 3, maxDelay);
    return min + Math.random() * (max - min);
  }
}
