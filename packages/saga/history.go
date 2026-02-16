package saga

import (
	"context"
	"errors"
	"time"
)

// HistoryStore persists saga execution history for debugging and idempotency
type HistoryStore interface {
	// Save persists a saga execution
	Save(ctx context.Context, execution *SagaExecution) error

	// Get retrieves a saga execution by ID
	Get(ctx context.Context, sagaID string) (*SagaExecution, error)

	// List retrieves saga executions with optional filters
	List(ctx context.Context, filter HistoryFilter) ([]SagaExecution, error)

	// Delete removes a saga execution from history
	Delete(ctx context.Context, sagaID string) error
}

// SagaExecution represents a saga execution instance
//
//nolint:revive // Keeping SagaExecution name for external API clarity
type SagaExecution struct {
	// ID uniquely identifies this saga execution
	ID string `json:"id" dynamodbav:"id"`

	// Status of the saga execution
	Status SagaStatus `json:"status" dynamodbav:"status"`

	// Steps executed in this saga
	Steps []StepExecution `json:"steps" dynamodbav:"steps"`

	// StartTime when saga execution began
	StartTime time.Time `json:"startTime" dynamodbav:"startTime"`

	// EndTime when saga execution completed (success or failure)
	EndTime time.Time `json:"endTime,omitempty" dynamodbav:"endTime,omitempty"`

	// Error message if saga failed
	Error string `json:"error,omitempty" dynamodbav:"error,omitempty"`

	// Metadata for custom tracking
	Metadata map[string]string `json:"metadata,omitempty" dynamodbav:"metadata,omitempty"`
}

// SagaStatus represents the status of a saga execution
//
//nolint:revive // Keeping SagaStatus name for external API clarity
type SagaStatus string

const (
	// SagaStatusRunning indicates the saga is currently executing
	SagaStatusRunning SagaStatus = "running"

	// SagaStatusCompleted indicates all steps completed successfully
	SagaStatusCompleted SagaStatus = "completed"

	// SagaStatusCompensated indicates saga failed and compensations succeeded
	SagaStatusCompensated SagaStatus = "compensated"

	// SagaStatusCompensationFailed indicates saga failed and compensations also failed
	SagaStatusCompensationFailed SagaStatus = "compensation_failed"

	// SagaStatusCancelled indicates saga was cancelled
	SagaStatusCancelled SagaStatus = "cancelled"
)

// StepExecution represents the execution of a single saga step
type StepExecution struct {
	// Name of the step
	Name string `json:"name" dynamodbav:"name"`

	// Status of the step execution
	Status StepStatus `json:"status" dynamodbav:"status"`

	// StartTime when step execution began
	StartTime time.Time `json:"startTime" dynamodbav:"startTime"`

	// EndTime when step execution completed
	EndTime time.Time `json:"endTime,omitempty" dynamodbav:"endTime,omitempty"`

	// Error message if step failed
	Error string `json:"error,omitempty" dynamodbav:"error,omitempty"`

	// Attempt number (for retries)
	Attempt int `json:"attempt,omitempty" dynamodbav:"attempt,omitempty"`
}

// StepStatus represents the status of a step execution
type StepStatus string

const (
	// StepStatusPending indicates the step has not started
	StepStatusPending StepStatus = "pending"

	// StepStatusRunning indicates the step is currently executing
	StepStatusRunning StepStatus = "running"

	// StepStatusCompleted indicates the step completed successfully
	StepStatusCompleted StepStatus = "completed"

	// StepStatusFailed indicates the step failed
	StepStatusFailed StepStatus = "failed"

	// StepStatusCompensated indicates the step was compensated
	StepStatusCompensated StepStatus = "compensated"
)

// HistoryFilter filters saga executions when listing
type HistoryFilter struct {
	// Status filters by saga status
	Status SagaStatus

	// StartAfter filters sagas that started after this time
	StartAfter time.Time

	// StartBefore filters sagas that started before this time
	StartBefore time.Time

	// Limit maximum number of results
	Limit int
}

// InMemoryHistoryStore is a simple in-memory implementation for testing
type InMemoryHistoryStore struct {
	executions map[string]*SagaExecution
}

// NewInMemoryHistoryStore creates a new in-memory history store
func NewInMemoryHistoryStore() *InMemoryHistoryStore {
	return &InMemoryHistoryStore{
		executions: make(map[string]*SagaExecution),
	}
}

// Save persists a saga execution.
func (s *InMemoryHistoryStore) Save(_ context.Context, execution *SagaExecution) error {
	// Clone to avoid mutations
	clone := *execution
	s.executions[execution.ID] = &clone
	return nil
}

// Get returns a saga execution by ID.
func (s *InMemoryHistoryStore) Get(_ context.Context, sagaID string) (*SagaExecution, error) {
	execution, ok := s.executions[sagaID]
	if !ok {
		return nil, ErrSagaNotFound
	}

	// Clone to avoid mutations
	clone := *execution
	return &clone, nil
}

// List returns saga executions matching the filter.
func (s *InMemoryHistoryStore) List(_ context.Context, filter HistoryFilter) ([]SagaExecution, error) {
	var results []SagaExecution

	for _, execution := range s.executions {
		// Apply filters
		if filter.Status != "" && execution.Status != filter.Status {
			continue
		}

		if !filter.StartAfter.IsZero() && execution.StartTime.Before(filter.StartAfter) {
			continue
		}

		if !filter.StartBefore.IsZero() && execution.StartTime.After(filter.StartBefore) {
			continue
		}

		// Clone and add to results
		clone := *execution
		results = append(results, clone)

		// Check limit
		if filter.Limit > 0 && len(results) >= filter.Limit {
			break
		}
	}

	return results, nil
}

// Delete removes a saga execution by ID.
func (s *InMemoryHistoryStore) Delete(_ context.Context, sagaID string) error {
	delete(s.executions, sagaID)
	return nil
}

// ErrSagaNotFound is returned when a saga execution is not found
var ErrSagaNotFound = errors.New("saga not found")
