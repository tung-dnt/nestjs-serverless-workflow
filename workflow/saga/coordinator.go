package saga

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"
)

// SagaCoordinator orchestrates distributed transactions with compensation
type SagaCoordinator struct {
	steps    []SagaStep
	strategy CompensationStrategy
	history  HistoryStore
	logger   *slog.Logger
}

// SagaStep represents a single step in a saga transaction
type SagaStep struct {
	// Name identifies the step
	Name string

	// Action is the forward transaction to execute
	Action StepFunc

	// Compensation is the rollback action if saga fails
	Compensation CompensationFunc

	// MaxRetries for this step (0 = no retries)
	MaxRetries int

	// RetryDelay between retry attempts
	RetryDelay time.Duration

	// Metadata for custom step configuration
	Metadata map[string]any
}

// StepFunc executes a saga step
// Returns data to pass to next step, or error on failure
type StepFunc func(ctx context.Context, data map[string]any) (map[string]any, error)

// CompensationFunc executes compensation for a failed saga
// Receives the data from when the step was executed
type CompensationFunc func(ctx context.Context, data map[string]any) error

// CompensationStrategy defines how compensations are executed
type CompensationStrategy int

const (
	// ReverseOrder executes compensations in reverse order (LIFO)
	// This is the default and most common strategy
	ReverseOrder CompensationStrategy = iota

	// InOrder executes compensations in the same order as steps
	InOrder

	// Parallel executes all compensations concurrently
	// Use with caution - may cause issues if compensations have dependencies
	Parallel
)

// NewCoordinator creates a new SAGA coordinator
func NewCoordinator(logger *slog.Logger) *SagaCoordinator {
	if logger == nil {
		logger = slog.Default()
	}

	return &SagaCoordinator{
		steps:    []SagaStep{},
		strategy: ReverseOrder, // Default to reverse order
		logger:   logger,
	}
}

// AddStep adds a step to the saga
func (c *SagaCoordinator) AddStep(step SagaStep) *SagaCoordinator {
	c.steps = append(c.steps, step)
	return c
}

// WithCompensationStrategy sets the compensation execution strategy
func (c *SagaCoordinator) WithCompensationStrategy(strategy CompensationStrategy) *SagaCoordinator {
	c.strategy = strategy
	return c
}

// WithHistoryStore sets the history store for tracking saga executions
func (c *SagaCoordinator) WithHistoryStore(store HistoryStore) *SagaCoordinator {
	c.history = store
	return c
}

// Execute runs the saga transaction
// Returns error if any step fails after retries
func (c *SagaCoordinator) Execute(ctx context.Context, initialData map[string]any) error {
	sagaID := generateSagaID()

	c.logger.Info("starting saga execution",
		"sagaId", sagaID,
		"stepCount", len(c.steps),
	)

	// Track execution history
	execution := &SagaExecution{
		ID:        sagaID,
		Status:    SagaStatusRunning,
		StartTime: time.Now(),
		Steps:     make([]StepExecution, 0, len(c.steps)),
	}

	// Save initial state if history store is configured
	if c.history != nil {
		if err := c.history.Save(ctx, execution); err != nil {
			c.logger.Warn("failed to save saga execution to history", "error", err)
		}
	}

	// Execute steps sequentially
	stepData := initialData
	executedSteps := []ExecutedStep{}

	for i, step := range c.steps {
		c.logger.Debug("executing saga step",
			"sagaId", sagaID,
			"step", step.Name,
			"index", i,
		)

		// Execute step with retries
		result, err := c.executeStepWithRetry(ctx, step, stepData)

		// Track step execution
		stepExec := StepExecution{
			Name:      step.Name,
			StartTime: time.Now(),
		}

		if err != nil {
			// Step failed - trigger compensations
			stepExec.Status = StepStatusFailed
			stepExec.Error = err.Error()
			execution.Steps = append(execution.Steps, stepExec)

			c.logger.Error("saga step failed, starting compensation",
				"sagaId", sagaID,
				"step", step.Name,
				"error", err,
			)

			// Execute compensations for all completed steps
			if compErr := c.compensate(ctx, executedSteps); compErr != nil {
				c.logger.Error("compensation failed",
					"sagaId", sagaID,
					"error", compErr,
				)

				execution.Status = SagaStatusCompensationFailed
				execution.EndTime = time.Now()
				execution.Error = fmt.Sprintf("step failed: %v, compensation failed: %v", err, compErr)

				if c.history != nil {
					c.history.Save(ctx, execution)
				}

				return fmt.Errorf("saga failed and compensation failed: step=%s, stepErr=%w, compErr=%v",
					step.Name, err, compErr)
			}

			execution.Status = SagaStatusCompensated
			execution.EndTime = time.Now()
			execution.Error = err.Error()

			if c.history != nil {
				c.history.Save(ctx, execution)
			}

			return fmt.Errorf("saga failed at step %s: %w", step.Name, err)
		}

		// Step succeeded
		stepExec.Status = StepStatusCompleted
		stepExec.EndTime = time.Now()
		execution.Steps = append(execution.Steps, stepExec)

		// Track for potential compensation
		executedSteps = append(executedSteps, ExecutedStep{
			Step: step,
			Data: stepData, // Save input data for compensation
		})

		// Update data for next step
		stepData = result

		c.logger.Debug("saga step completed",
			"sagaId", sagaID,
			"step", step.Name,
		)
	}

	// All steps completed successfully
	execution.Status = SagaStatusCompleted
	execution.EndTime = time.Now()

	if c.history != nil {
		if err := c.history.Save(ctx, execution); err != nil {
			c.logger.Warn("failed to save successful saga execution", "error", err)
		}
	}

	c.logger.Info("saga completed successfully",
		"sagaId", sagaID,
		"duration", execution.EndTime.Sub(execution.StartTime),
	)

	return nil
}

// executeStepWithRetry executes a step with retry logic
func (c *SagaCoordinator) executeStepWithRetry(
	ctx context.Context,
	step SagaStep,
	data map[string]any,
) (map[string]any, error) {
	var lastErr error

	maxRetries := step.MaxRetries
	if maxRetries == 0 {
		maxRetries = 1 // At least one attempt
	}

	for attempt := 0; attempt < maxRetries; attempt++ {
		// Check context cancellation
		if err := ctx.Err(); err != nil {
			return nil, fmt.Errorf("context cancelled during step execution: %w", err)
		}

		// Execute step
		result, err := step.Action(ctx, data)
		if err == nil {
			if attempt > 0 {
				c.logger.Info("step succeeded after retry",
					"step", step.Name,
					"attempt", attempt+1,
				)
			}
			return result, nil
		}

		lastErr = err

		// Check if error is retryable
		if errors.Is(err, ErrNonRetryable) {
			c.logger.Error("step failed with non-retryable error",
				"step", step.Name,
				"error", err,
			)
			return nil, err
		}

		// Retry if not last attempt
		if attempt < maxRetries-1 {
			delay := step.RetryDelay
			if delay == 0 {
				delay = 1 * time.Second // Default retry delay
			}

			c.logger.Warn("step failed, retrying",
				"step", step.Name,
				"attempt", attempt+1,
				"maxRetries", maxRetries,
				"retryDelay", delay,
				"error", err,
			)

			select {
			case <-time.After(delay):
				// Continue to retry
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
	}

	return nil, fmt.Errorf("step failed after %d attempts: %w", maxRetries, lastErr)
}

// compensate executes compensation for all executed steps
func (c *SagaCoordinator) compensate(ctx context.Context, executedSteps []ExecutedStep) error {
	c.logger.Info("executing compensations",
		"strategy", c.strategy,
		"stepCount", len(executedSteps),
	)

	switch c.strategy {
	case ReverseOrder:
		return c.compensateReverseOrder(ctx, executedSteps)
	case InOrder:
		return c.compensateInOrder(ctx, executedSteps)
	case Parallel:
		return c.compensateParallel(ctx, executedSteps)
	default:
		return fmt.Errorf("unknown compensation strategy: %d", c.strategy)
	}
}

// ExecutedStep tracks a completed step for compensation
type ExecutedStep struct {
	Step SagaStep
	Data map[string]any
}

// generateSagaID generates a unique saga execution ID
func generateSagaID() string {
	return fmt.Sprintf("saga-%d", time.Now().UnixNano())
}

// Sentinel errors
var (
	// ErrNonRetryable indicates an error that should not be retried
	ErrNonRetryable = errors.New("non-retryable error")
)
