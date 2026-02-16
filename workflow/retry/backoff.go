package retry

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"time"
)

// Strategy defines the interface for retry strategies
type Strategy interface {
	// NextDelay returns the delay before the next retry attempt
	// attempt is 0-indexed (0 = first retry after initial failure)
	NextDelay(attempt int) time.Duration

	// ShouldRetry determines if another retry should be attempted
	ShouldRetry(attempt int, err error) bool
}

// ExponentialBackoff implements exponential backoff with jitter
type ExponentialBackoff struct {
	// InitialDelay is the delay for the first retry
	InitialDelay time.Duration

	// MaxDelay is the maximum delay between retries
	MaxDelay time.Duration

	// Multiplier is the factor by which delay increases each retry
	Multiplier float64

	// MaxRetries is the maximum number of retry attempts (0 = unlimited)
	MaxRetries int

	// MaxDuration is the maximum total duration for all retries (0 = unlimited)
	MaxDuration time.Duration

	// Jitter adds randomness to delays to prevent thundering herd
	// Value between 0.0 (no jitter) and 1.0 (full jitter)
	Jitter float64

	// startTime tracks when retries began (for MaxDuration)
	startTime time.Time
}

// NewExponentialBackoff creates an exponential backoff strategy with defaults
func NewExponentialBackoff() *ExponentialBackoff {
	return &ExponentialBackoff{
		InitialDelay: 1 * time.Second,
		MaxDelay:     30 * time.Second,
		Multiplier:   2.0,
		MaxRetries:   5,
		MaxDuration:  5 * time.Minute,
		Jitter:       0.1, // 10% jitter
		startTime:    time.Now(),
	}
}

// NextDelay calculates the delay for the next retry attempt
func (b *ExponentialBackoff) NextDelay(attempt int) time.Duration {
	// Calculate base delay: initialDelay * (multiplier ^ attempt)
	delay := float64(b.InitialDelay) * math.Pow(b.Multiplier, float64(attempt))

	// Cap at max delay
	if delay > float64(b.MaxDelay) {
		delay = float64(b.MaxDelay)
	}

	// Add jitter if configured
	if b.Jitter > 0 {
		jitterAmount := delay * b.Jitter
		delay = delay - jitterAmount + (rand.Float64() * 2 * jitterAmount)
	}

	return time.Duration(delay)
}

// ShouldRetry determines if another retry should be attempted
func (b *ExponentialBackoff) ShouldRetry(attempt int, err error) bool {
	// Check max retries
	if b.MaxRetries > 0 && attempt >= b.MaxRetries {
		return false
	}

	// Check max duration
	if b.MaxDuration > 0 && time.Since(b.startTime) >= b.MaxDuration {
		return false
	}

	// Don't retry nil errors
	if err == nil {
		return false
	}

	return true
}

// FixedBackoff implements a fixed delay between retries
type FixedBackoff struct {
	// Delay is the fixed delay between retries
	Delay time.Duration

	// MaxRetries is the maximum number of retry attempts (0 = unlimited)
	MaxRetries int

	// MaxDuration is the maximum total duration for all retries (0 = unlimited)
	MaxDuration time.Duration

	// startTime tracks when retries began
	startTime time.Time
}

// NewFixedBackoff creates a fixed backoff strategy
func NewFixedBackoff(delay time.Duration, maxRetries int) *FixedBackoff {
	return &FixedBackoff{
		Delay:      delay,
		MaxRetries: maxRetries,
		startTime:  time.Now(),
	}
}

// NextDelay returns the fixed delay
func (b *FixedBackoff) NextDelay(attempt int) time.Duration {
	return b.Delay
}

// ShouldRetry determines if another retry should be attempted
func (b *FixedBackoff) ShouldRetry(attempt int, err error) bool {
	if b.MaxRetries > 0 && attempt >= b.MaxRetries {
		return false
	}

	if b.MaxDuration > 0 && time.Since(b.startTime) >= b.MaxDuration {
		return false
	}

	if err == nil {
		return false
	}

	return true
}

// LinearBackoff implements linear backoff (delay increases linearly)
type LinearBackoff struct {
	// InitialDelay is the delay for the first retry
	InitialDelay time.Duration

	// Increment is added to the delay for each retry
	Increment time.Duration

	// MaxDelay is the maximum delay between retries
	MaxDelay time.Duration

	// MaxRetries is the maximum number of retry attempts (0 = unlimited)
	MaxRetries int

	// startTime tracks when retries began
	startTime time.Time
}

// NewLinearBackoff creates a linear backoff strategy
func NewLinearBackoff(initialDelay, increment time.Duration, maxRetries int) *LinearBackoff {
	return &LinearBackoff{
		InitialDelay: initialDelay,
		Increment:    increment,
		MaxDelay:     30 * time.Second,
		MaxRetries:   maxRetries,
		startTime:    time.Now(),
	}
}

// NextDelay calculates the delay with linear increase
func (b *LinearBackoff) NextDelay(attempt int) time.Duration {
	delay := b.InitialDelay + (time.Duration(attempt) * b.Increment)

	if b.MaxDelay > 0 && delay > b.MaxDelay {
		delay = b.MaxDelay
	}

	return delay
}

// ShouldRetry determines if another retry should be attempted
func (b *LinearBackoff) ShouldRetry(attempt int, err error) bool {
	if b.MaxRetries > 0 && attempt >= b.MaxRetries {
		return false
	}

	if err == nil {
		return false
	}

	return true
}

// Do executes a function with retry logic
func Do(ctx context.Context, strategy Strategy, fn func() error) error {
	var lastErr error
	attempt := 0

	for {
		// Execute function
		err := fn()
		if err == nil {
			return nil
		}

		lastErr = err

		// Check if should retry
		if !strategy.ShouldRetry(attempt, err) {
			return fmt.Errorf("max retries exceeded: %w", lastErr)
		}

		// Calculate delay
		delay := strategy.NextDelay(attempt)

		// Wait with context cancellation support
		select {
		case <-time.After(delay):
			attempt++
		case <-ctx.Done():
			return fmt.Errorf("retry cancelled: %w", ctx.Err())
		}
	}
}

// DoWithData executes a function with retry logic and data return
func DoWithData[T any](ctx context.Context, strategy Strategy, fn func() (T, error)) (T, error) {
	var (
		lastErr error
		result  T
	)
	attempt := 0

	for {
		// Execute function
		res, err := fn()
		if err == nil {
			return res, nil
		}

		lastErr = err

		// Check if should retry
		if !strategy.ShouldRetry(attempt, err) {
			return result, fmt.Errorf("max retries exceeded: %w", lastErr)
		}

		// Calculate delay
		delay := strategy.NextDelay(attempt)

		// Wait with context cancellation support
		select {
		case <-time.After(delay):
			attempt++
		case <-ctx.Done():
			return result, fmt.Errorf("retry cancelled: %w", ctx.Err())
		}
	}
}
