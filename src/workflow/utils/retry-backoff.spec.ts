import { RetryBackoff, RetryConfig, RetryStrategy } from './retry-backoff';

describe('RetryBackoff', () => {
  describe('Fixed Delay', () => {
    it('should return same delay for all attempts', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        strategy: RetryStrategy.FIXED,
        initialDelay: 1000,
      };

      expect(RetryBackoff.calculateDelay(0, config)).toBe(1000);
      expect(RetryBackoff.calculateDelay(1, config)).toBe(1000);
      expect(RetryBackoff.calculateDelay(5, config)).toBe(1000);
    });
  });

  describe('Exponential Backoff', () => {
    it('should double delay each attempt', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        strategy: RetryStrategy.EXPONENTIAL,
        initialDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 60000,
      };

      expect(RetryBackoff.calculateDelay(0, config)).toBe(1000); // 1000 * 2^0
      expect(RetryBackoff.calculateDelay(1, config)).toBe(2000); // 1000 * 2^1
      expect(RetryBackoff.calculateDelay(2, config)).toBe(4000); // 1000 * 2^2
      expect(RetryBackoff.calculateDelay(3, config)).toBe(8000); // 1000 * 2^3
    });

    it('should cap at maxDelay', () => {
      const config: RetryConfig = {
        maxAttempts: 10,
        strategy: RetryStrategy.EXPONENTIAL,
        initialDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 5000,
      };

      expect(RetryBackoff.calculateDelay(0, config)).toBe(1000);
      expect(RetryBackoff.calculateDelay(1, config)).toBe(2000);
      expect(RetryBackoff.calculateDelay(2, config)).toBe(4000);
      expect(RetryBackoff.calculateDelay(3, config)).toBe(5000); // capped
      expect(RetryBackoff.calculateDelay(10, config)).toBe(5000); // capped
    });
  });

  describe('Exponential Backoff with Jitter', () => {
    it('should return delay between 0 and baseDelay with full jitter', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        strategy: RetryStrategy.EXPONENTIAL_JITTER,
        initialDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 60000,
        jitter: true,
      };

      for (let attempt = 0; attempt < 5; attempt++) {
        const baseDelay = 1000 * Math.pow(2, attempt);
        const delay = RetryBackoff.calculateDelay(attempt, config);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(baseDelay);
      }
    });

    it('should return delay within jitter range for partial jitter', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        strategy: RetryStrategy.EXPONENTIAL_JITTER,
        initialDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 60000,
        jitter: 0.25, // 25% jitter
      };

      for (let attempt = 0; attempt < 5; attempt++) {
        const baseDelay = Math.min(1000 * Math.pow(2, attempt), 60000);
        const delay = RetryBackoff.calculateDelay(attempt, config);
        const expectedMin = baseDelay * 0.75; // -25%
        const expectedMax = baseDelay * 1.25; // +25%
        expect(delay).toBeGreaterThanOrEqual(expectedMin);
        expect(delay).toBeLessThanOrEqual(expectedMax);
      }
    });

    it('should produce different delays across multiple calls (randomness check)', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        strategy: RetryStrategy.EXPONENTIAL_JITTER,
        initialDelay: 1000,
        jitter: true,
      };

      const delays = new Set();
      for (let i = 0; i < 100; i++) {
        delays.add(RetryBackoff.calculateDelay(3, config));
      }

      // Should have multiple different values due to randomness
      expect(delays.size).toBeGreaterThan(50);
    });
  });

  describe('Decorrelated Jitter', () => {
    it('should return delay between initialDelay and previousDelay * 3', () => {
      const initialDelay = 1000;
      const previousDelay = 5000;
      const maxDelay = 60000;

      for (let i = 0; i < 100; i++) {
        const delay = RetryBackoff.decorrelatedJitter(previousDelay, initialDelay, maxDelay);
        expect(delay).toBeGreaterThanOrEqual(initialDelay);
        expect(delay).toBeLessThanOrEqual(previousDelay * 3);
      }
    });

    it('should cap at maxDelay', () => {
      const delay = RetryBackoff.decorrelatedJitter(50000, 1000, 10000);
      expect(delay).toBeLessThanOrEqual(10000);
    });
  });
});
