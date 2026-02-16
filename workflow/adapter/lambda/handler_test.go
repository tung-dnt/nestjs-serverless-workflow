package lambda

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/tung-dnt/nestjs-serverless-workflow/workflow/core"
)

// Test types for Order workflow
type OrderState string

const (
	OrderStatePending    OrderState = "pending"
	OrderStateProcessing OrderState = "processing"
	OrderStateShipped    OrderState = "shipped"
	OrderStateFailed     OrderState = "failed"
)

type OrderEvent string

const (
	OrderEventCreated OrderEvent = "order.created"
)

type Order struct {
	ID     string
	Status OrderState
	URN    string
}

// MockEntityService for testing
type MockEntityService struct {
	entities  map[string]*Order
	updateErr error
}

func NewMockEntityService() *MockEntityService {
	return &MockEntityService{
		entities: make(map[string]*Order),
	}
}

func (m *MockEntityService) Create(ctx context.Context) (*Order, error) {
	return &Order{Status: OrderStatePending}, nil
}

func (m *MockEntityService) Load(ctx context.Context, urn string) (*Order, error) {
	entity, ok := m.entities[urn]
	if !ok {
		return nil, fmt.Errorf("%w: %s", core.ErrEntityNotFound, urn)
	}
	return entity, nil
}

func (m *MockEntityService) Update(ctx context.Context, entity *Order, status OrderState) (*Order, error) {
	if m.updateErr != nil {
		return nil, m.updateErr
	}
	entity.Status = status
	m.entities[entity.URN] = entity
	return entity, nil
}

func (m *MockEntityService) Status(entity *Order) OrderState {
	return entity.Status
}

func (m *MockEntityService) URN(entity *Order) string {
	return entity.URN
}

func handleOrderCreated(ctx context.Context, order *Order, payload map[string]any) (map[string]any, error) {
	return map[string]any{"processed": true}, nil
}

func setupTestOrchestrator(mockEntity *MockEntityService) *core.Orchestrator {
	workflow := core.NewWorkflowBuilder[*Order, OrderEvent, OrderState]("TestOrderWorkflow").
		SetStates(core.WorkflowStates[OrderState]{
			Finals: []OrderState{OrderStateShipped},
			Idles:  []OrderState{OrderStatePending},
			Failed: OrderStateFailed,
		}).
		AddTransition(core.Transition[*Order, OrderEvent, OrderState]{
			Event: OrderEventCreated,
			From:  []OrderState{OrderStatePending},
			To:    OrderStateProcessing,
		}).
		OnEvent(OrderEventCreated, handleOrderCreated).
		WithEntityService(mockEntity).
		Build()

	orchestrator := core.NewOrchestrator(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})))
	orchestrator.Register(workflow.AsInterface())

	return orchestrator
}

func createSQSMessage(topic, urn string, payload map[string]any) events.SQSMessage {
	event := core.WorkflowEvent{
		Topic:   topic,
		URN:     urn,
		Payload: payload,
	}

	body, _ := json.Marshal(event)

	return events.SQSMessage{
		MessageId: "test-message-id",
		Body:      string(body),
	}
}

func TestHandler_HandleSQSEvent(t *testing.T) {
	tests := []struct {
		name               string
		setupEntity        func() *MockEntityService
		messages           []events.SQSMessage
		wantFailureCount   int
		wantSuccessfulURNs []string
	}{
		{
			name: "successful single message",
			setupEntity: func() *MockEntityService {
				mockEntity := NewMockEntityService()
				mockEntity.entities["order:123"] = &Order{
					ID:     "123",
					URN:    "order:123",
					Status: OrderStatePending,
				}
				return mockEntity
			},
			messages: []events.SQSMessage{
				createSQSMessage("order.created", "order:123", map[string]any{}),
			},
			wantFailureCount:   0,
			wantSuccessfulURNs: []string{"order:123"},
		},
		{
			name: "multiple successful messages",
			setupEntity: func() *MockEntityService {
				mockEntity := NewMockEntityService()
				mockEntity.entities["order:1"] = &Order{ID: "1", URN: "order:1", Status: OrderStatePending}
				mockEntity.entities["order:2"] = &Order{ID: "2", URN: "order:2", Status: OrderStatePending}
				mockEntity.entities["order:3"] = &Order{ID: "3", URN: "order:3", Status: OrderStatePending}
				return mockEntity
			},
			messages: []events.SQSMessage{
				createSQSMessage("order.created", "order:1", map[string]any{}),
				createSQSMessage("order.created", "order:2", map[string]any{}),
				createSQSMessage("order.created", "order:3", map[string]any{}),
			},
			wantFailureCount:   0,
			wantSuccessfulURNs: []string{"order:1", "order:2", "order:3"},
		},
		{
			name: "entity not found - should fail",
			setupEntity: func() *MockEntityService {
				return NewMockEntityService()
			},
			messages: []events.SQSMessage{
				createSQSMessage("order.created", "order:not-found", map[string]any{}),
			},
			wantFailureCount: 1,
		},
		{
			name: "invalid JSON - should fail",
			setupEntity: func() *MockEntityService {
				return NewMockEntityService()
			},
			messages: []events.SQSMessage{
				{
					MessageId: "test-1",
					Body:      "invalid json {{{",
				},
			},
			wantFailureCount: 1,
		},
		{
			name: "partial batch failure",
			setupEntity: func() *MockEntityService {
				mockEntity := NewMockEntityService()
				mockEntity.entities["order:success"] = &Order{
					ID:     "success",
					URN:    "order:success",
					Status: OrderStatePending,
				}
				// order:fail doesn't exist
				return mockEntity
			},
			messages: []events.SQSMessage{
				createSQSMessage("order.created", "order:success", map[string]any{}),
				createSQSMessage("order.created", "order:fail", map[string]any{}),
			},
			wantFailureCount:   1,
			wantSuccessfulURNs: []string{"order:success"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockEntity := tt.setupEntity()
			orchestrator := setupTestOrchestrator(mockEntity)
			handler := NewHandler(orchestrator, nil)

			sqsEvent := events.SQSEvent{
				Records: tt.messages,
			}

			resp, err := handler.HandleSQSEvent(context.Background(), sqsEvent)
			if err != nil {
				t.Errorf("HandleSQSEvent() unexpected error = %v", err)
			}

			if len(resp.BatchItemFailures) != tt.wantFailureCount {
				t.Errorf("expected %d failures, got %d", tt.wantFailureCount, len(resp.BatchItemFailures))
			}

			// Verify successful entities were updated
			for _, urn := range tt.wantSuccessfulURNs {
				entity, ok := mockEntity.entities[urn]
				if !ok {
					t.Errorf("entity %s not found", urn)
					continue
				}
				if entity.Status != OrderStateProcessing {
					t.Errorf("expected entity %s to be in processing state, got %s", urn, entity.Status)
				}
			}
		})
	}
}

func TestHandler_TimeoutHandling(t *testing.T) {
	t.Run("context with deadline", func(t *testing.T) {
		mockEntity := NewMockEntityService()
		orchestrator := setupTestOrchestrator(mockEntity)
		handler := NewHandler(orchestrator, nil)

		// Create context with deadline (simulating Lambda)
		deadline := time.Now().Add(10 * time.Second)
		ctx, cancel := context.WithDeadline(context.Background(), deadline)
		defer cancel()

		// Create safe context
		safeCtx, safeCancel := handler.createSafeContext(ctx)
		defer safeCancel()

		// Verify safe deadline is 5 seconds before original deadline
		safeDeadline, ok := safeCtx.Deadline()
		if !ok {
			t.Fatal("expected safe context to have deadline")
		}

		expectedDeadline := deadline.Add(-5 * time.Second)
		diff := safeDeadline.Sub(expectedDeadline)
		if diff > 100*time.Millisecond || diff < -100*time.Millisecond {
			t.Errorf("safe deadline not correctly calculated, diff = %v", diff)
		}
	})

	t.Run("context without Lambda deadline", func(t *testing.T) {
		mockEntity := NewMockEntityService()
		orchestrator := setupTestOrchestrator(mockEntity)
		handler := NewHandler(orchestrator, nil)

		// Create safe context without Lambda context
		safeCtx, cancel := handler.createSafeContext(context.Background())
		defer cancel()

		// Should have a default deadline
		_, ok := safeCtx.Deadline()
		if !ok {
			t.Error("expected safe context to have default deadline")
		}
	})
}

func TestHandler_UnretriableErrors(t *testing.T) {
	t.Run("unretriable error does not cause batch failure", func(t *testing.T) {
		// Create workflow with handler that returns unretriable error
		mockEntity := NewMockEntityService()
		mockEntity.entities["order:123"] = &Order{
			ID:     "123",
			URN:    "order:123",
			Status: OrderStatePending,
		}

		handleWithUnretriableError := func(ctx context.Context, order *Order, payload map[string]any) (map[string]any, error) {
			return nil, fmt.Errorf("%w: test unretriable error", core.ErrUnretriable)
		}

		workflow := core.NewWorkflowBuilder[*Order, OrderEvent, OrderState]("UnretriableWorkflow").
			SetStates(core.WorkflowStates[OrderState]{
				Finals: []OrderState{OrderStateShipped},
				Idles:  []OrderState{OrderStatePending},
				Failed: OrderStateFailed,
			}).
			AddTransition(core.Transition[*Order, OrderEvent, OrderState]{
				Event: OrderEventCreated,
				From:  []OrderState{OrderStatePending},
				To:    OrderStateProcessing,
			}).
			OnEvent(OrderEventCreated, handleWithUnretriableError).
			WithEntityService(mockEntity).
			Build()

		orchestrator := core.NewOrchestrator(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})))
		orchestrator.Register(workflow.AsInterface())

		handler := NewHandler(orchestrator, nil)

		sqsEvent := events.SQSEvent{
			Records: []events.SQSMessage{
				createSQSMessage("order.created", "order:123", map[string]any{}),
			},
		}

		resp, err := handler.HandleSQSEvent(context.Background(), sqsEvent)
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}

		// Unretriable errors should not cause batch failures
		if len(resp.BatchItemFailures) != 0 {
			t.Errorf("expected 0 batch failures for unretriable error, got %d", len(resp.BatchItemFailures))
		}

		// Entity should be in failed state
		entity := mockEntity.entities["order:123"]
		if entity.Status != OrderStateFailed {
			t.Errorf("expected entity to be in failed state, got %s", entity.Status)
		}
	})

	t.Run("retriable error causes batch failure", func(t *testing.T) {
		mockEntity := NewMockEntityService()
		mockEntity.entities["order:123"] = &Order{
			ID:     "123",
			URN:    "order:123",
			Status: OrderStatePending,
		}

		handleWithRetriableError := func(ctx context.Context, order *Order, payload map[string]any) (map[string]any, error) {
			return nil, errors.New("retriable error")
		}

		workflow := core.NewWorkflowBuilder[*Order, OrderEvent, OrderState]("RetriableWorkflow").
			SetStates(core.WorkflowStates[OrderState]{
				Finals: []OrderState{OrderStateShipped},
				Idles:  []OrderState{OrderStatePending},
				Failed: OrderStateFailed,
			}).
			AddTransition(core.Transition[*Order, OrderEvent, OrderState]{
				Event: OrderEventCreated,
				From:  []OrderState{OrderStatePending},
				To:    OrderStateProcessing,
			}).
			OnEvent(OrderEventCreated, handleWithRetriableError).
			WithEntityService(mockEntity).
			Build()

		orchestrator := core.NewOrchestrator(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})))
		orchestrator.Register(workflow.AsInterface())

		handler := NewHandler(orchestrator, nil)

		sqsEvent := events.SQSEvent{
			Records: []events.SQSMessage{
				createSQSMessage("order.created", "order:123", map[string]any{}),
			},
		}

		resp, err := handler.HandleSQSEvent(context.Background(), sqsEvent)
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}

		// Retriable errors should cause batch failures
		if len(resp.BatchItemFailures) != 1 {
			t.Errorf("expected 1 batch failure for retriable error, got %d", len(resp.BatchItemFailures))
		}
	})
}
