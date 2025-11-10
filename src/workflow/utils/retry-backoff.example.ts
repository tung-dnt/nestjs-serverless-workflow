import { RetryBackoff, RetryConfig, RetryStrategy } from './retry-backoff';

/**
 * Example usage demonstrating different retry strategies
 */

// Example 1: Fixed delay - simple and predictable
const fixedConfig: RetryConfig = {
  maxAttempts: 3,
  strategy: RetryStrategy.FIXED,
  initialDelay: 2000, // 2 seconds between each retry
};

console.log('Fixed Delay Strategy:');
for (let i = 0; i < 3; i++) {
  console.log(`Attempt ${i}: ${RetryBackoff.calculateDelay(i, fixedConfig)}ms`);
}
// Output:
// Attempt 0: 2000ms
// Attempt 1: 2000ms
// Attempt 2: 2000ms

// Example 2: Exponential backoff - predictable but growing delays
const exponentialConfig: RetryConfig = {
  maxAttempts: 5,
  strategy: RetryStrategy.EXPONENTIAL,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000,
};

console.log('\nExponential Backoff (no jitter):');
for (let i = 0; i < 5; i++) {
  console.log(`Attempt ${i}: ${RetryBackoff.calculateDelay(i, exponentialConfig)}ms`);
}
// Output:
// Attempt 0: 1000ms
// Attempt 1: 2000ms
// Attempt 2: 4000ms
// Attempt 3: 8000ms
// Attempt 4: 16000ms

// Example 3: Exponential backoff with FULL jitter - recommended for distributed systems
const fullJitterConfig: RetryConfig = {
  maxAttempts: 5,
  strategy: RetryStrategy.EXPONENTIAL_JITTER,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000,
  jitter: true, // Full jitter
};

console.log('\nExponential Backoff with Full Jitter:');
for (let i = 0; i < 5; i++) {
  const delay = RetryBackoff.calculateDelay(i, fullJitterConfig);
  const maxPossible = Math.min(1000 * Math.pow(2, i), 30000);
  console.log(`Attempt ${i}: ${delay.toFixed(0)}ms (range: 0-${maxPossible}ms)`);
}
// Output (randomized):
// Attempt 0: 543ms (range: 0-1000ms)
// Attempt 1: 1234ms (range: 0-2000ms)
// Attempt 2: 2891ms (range: 0-4000ms)
// Attempt 3: 5432ms (range: 0-8000ms)
// Attempt 4: 12345ms (range: 0-16000ms)

// Example 4: Exponential backoff with PARTIAL jitter (25%)
const partialJitterConfig: RetryConfig = {
  maxAttempts: 5,
  strategy: RetryStrategy.EXPONENTIAL_JITTER,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000,
  jitter: 0.25, // 25% jitter
};

console.log('\nExponential Backoff with 25% Jitter:');
for (let i = 0; i < 5; i++) {
  const delay = RetryBackoff.calculateDelay(i, partialJitterConfig);
  const baseDelay = Math.min(1000 * Math.pow(2, i), 30000);
  const min = baseDelay * 0.75;
  const max = baseDelay * 1.25;
  console.log(`Attempt ${i}: ${delay.toFixed(0)}ms (range: ${min}-${max}ms)`);
}
// Output (randomized):
// Attempt 0: 876ms (range: 750-1250ms)
// Attempt 1: 1834ms (range: 1500-2500ms)
// Attempt 2: 3567ms (range: 3000-5000ms)
// Attempt 3: 7234ms (range: 6000-10000ms)
// Attempt 4: 14567ms (range: 12000-20000ms)

// Example 5: Decorrelated jitter (more aggressive)
console.log('\nDecorrelated Jitter:');
let previousDelay = 1000;
for (let i = 0; i < 5; i++) {
  const delay = RetryBackoff.decorrelatedJitter(previousDelay, 1000, 30000);
  console.log(`Attempt ${i}: ${delay.toFixed(0)}ms`);
  previousDelay = delay;
}

// Example 6: Real-world usage in a retry function
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < config.maxAttempts - 1) {
        const delay = RetryBackoff.calculateDelay(attempt, config);
        console.log(`Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

// Usage:
async function unreliableApiCall(): Promise<string> {
  if (Math.random() < 0.7) {
    throw new Error('Temporary network error');
  }
  return 'Success!';
}

retryWithBackoff(unreliableApiCall, fullJitterConfig)
  .then(result => console.log('Result:', result))
  .catch(error => console.error('All retries failed:', error.message));
