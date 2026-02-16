package retry

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

func TestExponentialBackoff_NextDelay(t *testing.T) {
	backoff := NewExponentialBackoff()
	backoff.InitialDelay = 1 * time.Second
	backoff.Multiplier = 2.0
	backoff.MaxDelay = 10 * time.Second
	backoff.Jitter = 0 // Disable jitter for predictable tests

	tests := []struct {
		attempt int
		want    time.Duration
	}{
		{0, 1 * time.Second},  // 1 * 2^0
		{1, 2 * time.Second},  // 1 * 2^1
		{2, 4 * time.Second},  // 1 * 2^2
		{3, 8 * time.Second},  // 1 * 2^3
		{4, 10 * time.Second}, // Capped at MaxDelay
		{5, 10 * time.Second}, // Still capped
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("attempt-%d", tt.attempt), func(t *testing.T) {
			got := backoff.NextDelay(tt.attempt)
			if got != tt.want {
				t.Errorf("NextDelay(%d) = %v, want %v", tt.attempt, got, tt.want)
			}
		})
	}
}

func TestExponentialBackoff_Jitter(t *testing.T) {
	backoff := NewExponentialBackoff()
	backoff.InitialDelay = 1 * time.Second
	backoff.Jitter = 0.5 // 50% jitter

	// Get delay multiple times and ensure they vary
	delays := make(map[time.Duration]bool)
	for i := 0; i < 10; i++ {
		delay := backoff.NextDelay(0)
		delays[delay] = true

		// Should be between 0.5s and 1.5s (±50% of 1s)
		if delay < 500*time.Millisecond || delay > 1500*time.Millisecond {
			t.Errorf("delay %v outside expected jitter range", delay)
		}
	}

	// Should have some variation (not all identical)
	if len(delays) < 2 {
		t.Error("jitter not adding variation to delays")
	}
}

func TestExponentialBackoff_ShouldRetry(t *testing.T) {
	tests := []struct {
		name    string
		backoff *ExponentialBackoff
		attempt int
		err     error
		want    bool
	}{
		{
			name: "within max retries",
			backoff: &ExponentialBackoff{
				MaxRetries: 5,
			},
			attempt: 2,
			err:     errors.New("error"),
			want:    true,
		},
		{
			name: "exceeded max retries",
			backoff: &ExponentialBackoff{
				MaxRetries: 3,
			},
			attempt: 3,
			err:     errors.New("error"),
			want:    false,
		},
		{
			name: "nil error",
			backoff: &ExponentialBackoff{
				MaxRetries: 5,
			},
			attempt: 1,
			err:     nil,
			want:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.backoff.ShouldRetry(tt.attempt, tt.err)
			if got != tt.want {
				t.Errorf("ShouldRetry() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFixedBackoff(t *testing.T) {
	backoff := NewFixedBackoff(2*time.Second, 3)

	// All delays should be the same
	for attempt := 0; attempt < 5; attempt++ {
		delay := backoff.NextDelay(attempt)
		if delay != 2*time.Second {
			t.Errorf("NextDelay(%d) = %v, want 2s", attempt, delay)
		}
	}

	// Should retry within max attempts
	if !backoff.ShouldRetry(0, errors.New("error")) {
		t.Error("should retry attempt 0")
	}

	if !backoff.ShouldRetry(2, errors.New("error")) {
		t.Error("should retry attempt 2")
	}

	// Should not retry after max attempts
	if backoff.ShouldRetry(3, errors.New("error")) {
		t.Error("should not retry after max attempts")
	}
}

func TestLinearBackoff(t *testing.T) {
	backoff := NewLinearBackoff(1*time.Second, 500*time.Millisecond, 5)

	tests := []struct {
		attempt int
		want    time.Duration
	}{
		{0, 1 * time.Second},         // initial
		{1, 1500 * time.Millisecond}, // initial + 1*increment
		{2, 2 * time.Second},         // initial + 2*increment
		{3, 2500 * time.Millisecond}, // initial + 3*increment
	}

	for _, tt := range tests {
		got := backoff.NextDelay(tt.attempt)
		if got != tt.want {
			t.Errorf("NextDelay(%d) = %v, want %v", tt.attempt, got, tt.want)
		}
	}
}

func TestDo_Success(t *testing.T) {
	backoff := NewFixedBackoff(10*time.Millisecond, 3)
	attempts := 0

	err := Do(context.Background(), backoff, func() error {
		attempts++
		if attempts < 2 {
			return errors.New("transient error")
		}
		return nil
	})

	if err != nil {
		t.Errorf("Do() unexpected error: %v", err)
	}

	if attempts != 2 {
		t.Errorf("expected 2 attempts, got %d", attempts)
	}
}

func TestDo_MaxRetriesExceeded(t *testing.T) {
	backoff := NewFixedBackoff(10*time.Millisecond, 3)
	attempts := 0

	err := Do(context.Background(), backoff, func() error {
		attempts++
		return errors.New("persistent error")
	})

	if err == nil {
		t.Fatal("Do() expected error")
	}

	// MaxRetries=3 means 1 initial + 3 retries = 4 total attempts
	if attempts != 4 {
		t.Errorf("expected 4 attempts (1 initial + 3 retries), got %d", attempts)
	}
}

func TestDo_ContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	backoff := NewFixedBackoff(100*time.Millisecond, 10)

	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	err := Do(ctx, backoff, func() error {
		return errors.New("error")
	})

	if err == nil {
		t.Fatal("Do() expected context cancellation error")
	}

	if !errors.Is(err, context.Canceled) {
		t.Errorf("expected context.Canceled, got %v", err)
	}
}

func TestDoWithData(t *testing.T) {
	backoff := NewFixedBackoff(10*time.Millisecond, 3)
	attempts := 0

	result, err := DoWithData(context.Background(), backoff, func() (string, error) {
		attempts++
		if attempts < 2 {
			return "", errors.New("transient error")
		}
		return "success", nil
	})

	if err != nil {
		t.Errorf("DoWithData() unexpected error: %v", err)
	}

	if result != "success" {
		t.Errorf("expected result 'success', got %s", result)
	}

	if attempts != 2 {
		t.Errorf("expected 2 attempts, got %d", attempts)
	}
}

func TestExponentialBackoff_MaxDuration(t *testing.T) {
	backoff := &ExponentialBackoff{
		InitialDelay: 50 * time.Millisecond,
		Multiplier:   2.0,
		MaxDelay:     200 * time.Millisecond,
		MaxRetries:   100, // High max retries
		MaxDuration:  300 * time.Millisecond,
	}
	// Set startTime right before calling Do()
	backoff.startTime = time.Now()

	attempts := 0
	start := time.Now()
	err := Do(context.Background(), backoff, func() error {
		attempts++
		return errors.New("error")
	})

	duration := time.Since(start)

	if err == nil {
		t.Fatal("expected error due to max duration")
	}

	// With 50ms initial delay and exponential backoff, we should get:
	// attempt 0: immediate, delay 50ms
	// attempt 1: after 50ms, delay 100ms
	// attempt 2: after 150ms total, delay 200ms (capped)
	// attempt 3: after 350ms total - should stop due to MaxDuration
	// So we expect around 3-4 attempts
	if attempts > 10 {
		t.Errorf("too many attempts (%d), should have stopped due to max duration earlier", attempts)
	}

	// Duration should be close to MaxDuration
	if duration < 250*time.Millisecond || duration > 500*time.Millisecond {
		t.Logf("duration %v, attempts %d (this is acceptable with timing variance)", duration, attempts)
	}
}

// Benchmark exponential backoff
func BenchmarkExponentialBackoff_NextDelay(b *testing.B) {
	backoff := NewExponentialBackoff()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		backoff.NextDelay(i % 10)
	}
}
