import { Injectable } from '@nestjs/common';
import type { IRetryHandler, IBackoffRetryConfig } from '@/core';
import { RetryBackoff } from '@/core/utils/retry-backoff';

/**
 * Mock retry handler for testing
 * Tracks retry attempts and delays
 */
@Injectable()
export class MockRetryHandler implements IRetryHandler {
  private retryAttempts: Array<{
    timestamp: number;
    delay: number;
    config: IBackoffRetryConfig;
  }> = [];
  private shouldFail = false;
  private failureError: Error | null = null;

  async execute(): Promise<void> {
    if (this.shouldFail) {
      throw this.failureError || new Error('Mock retry handler failure');
    }

    // Calculate delay based on attempt count
    const attempt = this.retryAttempts.length;
    const config = this.getLastConfig() || {
      handler: 'default',
      maxAttempts: 3,
      strategy: 'exponential_jitter' as any,
      initialDelay: 1000,
      backoffMultiplier: 2,
      maxDelay: 60000,
      jitter: true,
    };

    const delay = RetryBackoff.calculateDelay(attempt, config);

    this.retryAttempts.push({
      timestamp: Date.now(),
      delay,
      config,
    });

    // Simulate delay (can be disabled in tests for speed)
    if (process.env.SKIP_RETRY_DELAY !== 'true') {
      await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 100))); // Cap at 100ms for tests
    }
  }

  /**
   * Get all retry attempts
   */
  getRetryAttempts(): Array<{ timestamp: number; delay: number; config: IBackoffRetryConfig }> {
    return [...this.retryAttempts];
  }

  /**
   * Get retry attempt count
   */
  getRetryCount(): number {
    return this.retryAttempts.length;
  }

  /**
   * Clear retry attempts
   */
  clearRetries(): void {
    this.retryAttempts = [];
  }

  /**
   * Simulate retry handler failure
   */
  simulateFailure(error?: Error): void {
    this.shouldFail = true;
    this.failureError = error || null;
  }

  /**
   * Reset failure simulation
   */
  resetFailure(): void {
    this.shouldFail = false;
    this.failureError = null;
  }

  /**
   * Set retry config (for testing)
   */
  private lastConfig: IBackoffRetryConfig | null = null;
  setLastConfig(config: IBackoffRetryConfig): void {
    this.lastConfig = config;
  }

  getLastConfig(): IBackoffRetryConfig | null {
    return this.lastConfig;
  }
}
