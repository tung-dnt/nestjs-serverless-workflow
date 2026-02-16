//nolint:revive // Test file with mock implementations that intentionally have unused parameters
package saga

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestCoordinator_Execute_Success(t *testing.T) {
	coordinator := NewCoordinator(nil)

	step1Called := false
	step2Called := false
	step3Called := false

	coordinator.
		AddStep(SagaStep{
			Name: "step1",
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				step1Called = true
				return map[string]any{"step1": "done"}, nil
			},
		}).
		AddStep(SagaStep{
			Name: "step2",
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				step2Called = true
				// Verify data from previous step
				if data["step1"] != "done" {
					t.Error("expected step1 data")
				}
				return map[string]any{"step2": "done"}, nil
			},
		}).
		AddStep(SagaStep{
			Name: "step3",
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				step3Called = true
				return map[string]any{"step3": "done"}, nil
			},
		})

	err := coordinator.Execute(context.Background(), map[string]any{})
	if err != nil {
		t.Fatalf("Execute() unexpected error: %v", err)
	}

	if !step1Called || !step2Called || !step3Called {
		t.Error("not all steps were called")
	}
}

func TestCoordinator_Execute_FailureWithCompensation(t *testing.T) {
	step1Compensated := false
	step2Compensated := false

	coordinator := NewCoordinator(nil).
		WithCompensationStrategy(ReverseOrder).
		AddStep(SagaStep{
			Name: "step1",
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				return map[string]any{"step1": "done"}, nil
			},
			Compensation: func(ctx context.Context, data map[string]any) error {
				step1Compensated = true
				return nil
			},
		}).
		AddStep(SagaStep{
			Name: "step2",
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				return map[string]any{"step2": "done"}, nil
			},
			Compensation: func(ctx context.Context, data map[string]any) error {
				step2Compensated = true
				return nil
			},
		}).
		AddStep(SagaStep{
			Name: "step3-fails",
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				return nil, errors.New("step3 failed")
			},
			Compensation: func(ctx context.Context, data map[string]any) error {
				t.Error("step3 compensation should not be called (it never succeeded)")
				return nil
			},
		})

	err := coordinator.Execute(context.Background(), map[string]any{})
	if err == nil {
		t.Fatal("Execute() expected error")
	}

	if !step1Compensated {
		t.Error("step1 compensation not called")
	}

	if !step2Compensated {
		t.Error("step2 compensation not called")
	}
}

func TestCoordinator_CompensationStrategies(t *testing.T) {
	tests := []struct {
		name          string
		strategy      CompensationStrategy
		expectedOrder []string
	}{
		{
			name:          "reverse order",
			strategy:      ReverseOrder,
			expectedOrder: []string{"step2", "step1"},
		},
		{
			name:          "in order",
			strategy:      InOrder,
			expectedOrder: []string{"step1", "step2"},
		},
		{
			name:          "parallel",
			strategy:      Parallel,
			expectedOrder: nil, // Order not guaranteed
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var compensationOrder []string

			coordinator := NewCoordinator(nil).
				WithCompensationStrategy(tt.strategy).
				AddStep(SagaStep{
					Name: "step1",
					Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
						return map[string]any{}, nil
					},
					Compensation: func(ctx context.Context, data map[string]any) error {
						compensationOrder = append(compensationOrder, "step1")
						return nil
					},
				}).
				AddStep(SagaStep{
					Name: "step2",
					Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
						return map[string]any{}, nil
					},
					Compensation: func(ctx context.Context, data map[string]any) error {
						compensationOrder = append(compensationOrder, "step2")
						return nil
					},
				}).
				AddStep(SagaStep{
					Name: "step3-fails",
					Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
						return nil, errors.New("failure")
					},
				})

			_ = coordinator.Execute(context.Background(), map[string]any{})

			// For parallel, just check both were called
			if tt.strategy == Parallel {
				if len(compensationOrder) != 2 {
					t.Errorf("expected 2 compensations, got %d", len(compensationOrder))
				}
				return
			}

			// For sequential strategies, check exact order
			if len(compensationOrder) != len(tt.expectedOrder) {
				t.Errorf("expected %d compensations, got %d", len(tt.expectedOrder), len(compensationOrder))
				return
			}

			for i, expected := range tt.expectedOrder {
				if compensationOrder[i] != expected {
					t.Errorf("compensation[%d]: expected %s, got %s", i, expected, compensationOrder[i])
				}
			}
		})
	}
}

func TestCoordinator_RetryLogic(t *testing.T) {
	attempts := 0

	coordinator := NewCoordinator(nil).
		AddStep(SagaStep{
			Name:       "retry-step",
			MaxRetries: 3,
			RetryDelay: 10 * time.Millisecond,
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				attempts++
				if attempts < 3 {
					return nil, errors.New("transient error")
				}
				return map[string]any{"success": true}, nil
			},
		})

	err := coordinator.Execute(context.Background(), map[string]any{})
	if err != nil {
		t.Fatalf("Execute() unexpected error after retries: %v", err)
	}

	if attempts != 3 {
		t.Errorf("expected 3 attempts, got %d", attempts)
	}
}

func TestCoordinator_NonRetryableError(t *testing.T) {
	attempts := 0

	coordinator := NewCoordinator(nil).
		AddStep(SagaStep{
			Name:       "non-retryable",
			MaxRetries: 5,
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				attempts++
				return nil, ErrNonRetryable
			},
		})

	err := coordinator.Execute(context.Background(), map[string]any{})
	if err == nil {
		t.Fatal("Execute() expected error")
	}

	if !errors.Is(err, ErrNonRetryable) {
		t.Errorf("expected ErrNonRetryable, got %v", err)
	}

	if attempts != 1 {
		t.Errorf("expected 1 attempt (no retries), got %d", attempts)
	}
}

func TestCoordinator_ContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	coordinator := NewCoordinator(nil).
		AddStep(SagaStep{
			Name: "step1",
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				return map[string]any{}, nil
			},
		}).
		AddStep(SagaStep{
			Name: "step2-cancels",
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				cancel() // Cancel context
				time.Sleep(100 * time.Millisecond)
				return map[string]any{}, nil
			},
		}).
		AddStep(SagaStep{
			Name: "step3",
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				t.Error("step3 should not be called after cancellation")
				return map[string]any{}, nil
			},
		})

	err := coordinator.Execute(ctx, map[string]any{})
	if err == nil {
		t.Fatal("Execute() expected cancellation error")
	}

	if !errors.Is(err, context.Canceled) {
		t.Errorf("expected context.Canceled, got %v", err)
	}
}

func TestCoordinator_WithHistoryStore(t *testing.T) {
	history := NewInMemoryHistoryStore()
	coordinator := NewCoordinator(nil).
		WithHistoryStore(history).
		AddStep(SagaStep{
			Name: "step1",
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				return map[string]any{}, nil
			},
		})

	err := coordinator.Execute(context.Background(), map[string]any{})
	if err != nil {
		t.Fatalf("Execute() unexpected error: %v", err)
	}

	// Verify history was saved
	executions, err := history.List(context.Background(), HistoryFilter{})
	if err != nil {
		t.Fatalf("List() error: %v", err)
	}

	if len(executions) != 1 {
		t.Errorf("expected 1 execution in history, got %d", len(executions))
	}

	if executions[0].Status != SagaStatusCompleted {
		t.Errorf("expected status %s, got %s", SagaStatusCompleted, executions[0].Status)
	}
}

func TestCoordinator_CompensationFailure(t *testing.T) {
	coordinator := NewCoordinator(nil).
		AddStep(SagaStep{
			Name: "step1",
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				return map[string]any{}, nil
			},
			Compensation: func(ctx context.Context, data map[string]any) error {
				return errors.New("compensation failed")
			},
		}).
		AddStep(SagaStep{
			Name: "step2-fails",
			Action: func(ctx context.Context, data map[string]any) (map[string]any, error) {
				return nil, errors.New("step failed")
			},
		})

	err := coordinator.Execute(context.Background(), map[string]any{})
	if err == nil {
		t.Fatal("Execute() expected error")
	}

	// Should contain both step failure and compensation failure
	errMsg := err.Error()
	if !contains(errMsg, "compensation failed") {
		t.Error("error should mention compensation failure")
	}
}

func TestInMemoryHistoryStore(t *testing.T) {
	store := NewInMemoryHistoryStore()

	// Test Save and Get
	execution := &SagaExecution{
		ID:        "test-saga-1",
		Status:    SagaStatusCompleted,
		StartTime: time.Now(),
		EndTime:   time.Now(),
	}

	err := store.Save(context.Background(), execution)
	if err != nil {
		t.Fatalf("Save() error: %v", err)
	}

	retrieved, err := store.Get(context.Background(), "test-saga-1")
	if err != nil {
		t.Fatalf("Get() error: %v", err)
	}

	if retrieved.ID != execution.ID {
		t.Errorf("expected ID %s, got %s", execution.ID, retrieved.ID)
	}

	// Test List with filter
	executions, err := store.List(context.Background(), HistoryFilter{
		Status: SagaStatusCompleted,
		Limit:  10,
	})
	if err != nil {
		t.Fatalf("List() error: %v", err)
	}

	if len(executions) != 1 {
		t.Errorf("expected 1 execution, got %d", len(executions))
	}

	// Test Delete
	err = store.Delete(context.Background(), "test-saga-1")
	if err != nil {
		t.Fatalf("Delete() error: %v", err)
	}

	_, err = store.Get(context.Background(), "test-saga-1")
	if !errors.Is(err, ErrSagaNotFound) {
		t.Error("expected ErrSagaNotFound after deletion")
	}
}

// Helper function
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) && (s[:len(substr)] == substr || s[len(s)-len(substr):] == substr || containsHelper(s, substr)))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
