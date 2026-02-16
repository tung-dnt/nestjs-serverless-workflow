package saga

import (
	"context"
	"errors"
	"fmt"
	"sync"
)

// compensateReverseOrder executes compensations in reverse order (LIFO)
// This is the most common strategy - undo in reverse order of execution
func (c *SagaCoordinator) compensateReverseOrder(ctx context.Context, executedSteps []ExecutedStep) error {
	var errs []error

	// Iterate backwards through executed steps
	for i := len(executedSteps) - 1; i >= 0; i-- {
		step := executedSteps[i]

		if step.Step.Compensation == nil {
			c.logger.Debug("no compensation defined for step, skipping",
				"step", step.Step.Name,
			)
			continue
		}

		c.logger.Info("executing compensation",
			"step", step.Step.Name,
			"strategy", "reverse-order",
			"index", i,
		)

		if err := step.Step.Compensation(ctx, step.Data); err != nil {
			c.logger.Error("compensation failed",
				"step", step.Step.Name,
				"error", err,
			)
			errs = append(errs, fmt.Errorf("compensation for step %s failed: %w", step.Step.Name, err))

			// Continue compensating other steps even if one fails
			// This ensures we attempt to clean up as much as possible
		} else {
			c.logger.Info("compensation completed",
				"step", step.Step.Name,
			)
		}
	}

	if len(errs) > 0 {
		return errors.Join(errs...)
	}

	return nil
}

// compensateInOrder executes compensations in the same order as execution
// This is less common but useful when compensations have forward dependencies
func (c *SagaCoordinator) compensateInOrder(ctx context.Context, executedSteps []ExecutedStep) error {
	var errs []error

	// Iterate forward through executed steps
	for i, step := range executedSteps {
		if step.Step.Compensation == nil {
			c.logger.Debug("no compensation defined for step, skipping",
				"step", step.Step.Name,
			)
			continue
		}

		c.logger.Info("executing compensation",
			"step", step.Step.Name,
			"strategy", "in-order",
			"index", i,
		)

		if err := step.Step.Compensation(ctx, step.Data); err != nil {
			c.logger.Error("compensation failed",
				"step", step.Step.Name,
				"error", err,
			)
			errs = append(errs, fmt.Errorf("compensation for step %s failed: %w", step.Step.Name, err))
		} else {
			c.logger.Info("compensation completed",
				"step", step.Step.Name,
			)
		}
	}

	if len(errs) > 0 {
		return errors.Join(errs...)
	}

	return nil
}

// compensateParallel executes all compensations concurrently
// This is the fastest but requires compensations to be independent
func (c *SagaCoordinator) compensateParallel(ctx context.Context, executedSteps []ExecutedStep) error {
	var (
		wg      sync.WaitGroup
		mu      sync.Mutex
		errs    []error
		errChan = make(chan error, len(executedSteps))
	)

	// Start goroutines for each compensation
	for _, step := range executedSteps {
		if step.Step.Compensation == nil {
			c.logger.Debug("no compensation defined for step, skipping",
				"step", step.Step.Name,
			)
			continue
		}

		wg.Add(1)

		go func(s ExecutedStep) {
			defer wg.Done()

			c.logger.Info("executing compensation",
				"step", s.Step.Name,
				"strategy", "parallel",
			)

			if err := s.Step.Compensation(ctx, s.Data); err != nil {
				c.logger.Error("compensation failed",
					"step", s.Step.Name,
					"error", err,
				)
				errChan <- fmt.Errorf("compensation for step %s failed: %w", s.Step.Name, err)
			} else {
				c.logger.Info("compensation completed",
					"step", s.Step.Name,
				)
			}
		}(step)
	}

	// Wait for all compensations to complete
	go func() {
		wg.Wait()
		close(errChan)
	}()

	// Collect errors
	for err := range errChan {
		mu.Lock()
		errs = append(errs, err)
		mu.Unlock()
	}

	if len(errs) > 0 {
		return errors.Join(errs...)
	}

	return nil
}

// CompensateWithRetry executes a compensation with retry logic
// This is a helper for compensation functions that may fail transiently
func CompensateWithRetry(
	ctx context.Context,
	compensation CompensationFunc,
	data map[string]any,
	maxRetries int,
) error {
	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		err := compensation(ctx, data)
		if err == nil {
			return nil
		}
		lastErr = err
		// Check if error is retryable
		if errors.Is(lastErr, ErrNonRetryable) {
			return lastErr
		}
	}

	return fmt.Errorf("compensation failed after %d attempts: %w", maxRetries, lastErr)
}
