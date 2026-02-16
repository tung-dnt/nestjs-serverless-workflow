package core

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"testing"
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
	OrderEventCreated    OrderEvent = "order.created"
	OrderEventProcessing OrderEvent = "order.processing"
	OrderEventShipped    OrderEvent = "order.shipped"
)

type Order struct {
	ID     string
	Items  []string
	Status OrderState
	URN    string
}

// MockEntityService for testing
type MockEntityService struct {
	entities map[string]*Order
	loadErr  error
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
	if m.loadErr != nil {
		return nil, m.loadErr
	}

	entity, ok := m.entities[urn]
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrEntityNotFound, urn)
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

// MockBrokerPublisher for testing
type MockBrokerPublisher struct {
	events []WorkflowEvent
	err    error
}

func (m *MockBrokerPublisher) Emit(ctx context.Context, event WorkflowEvent) error {
	if m.err != nil {
		return m.err
	}
	m.events = append(m.events, event)
	return nil
}

// Test handler functions
func handleOrderCreated(ctx context.Context, order *Order, payload map[string]any) (map[string]any, error) {
	if len(order.Items) == 0 {
		return nil, fmt.Errorf("%w: order must have items", ErrUnretriable)
	}

	return map[string]any{"processed": true}, nil
}

func handleOrderProcessing(ctx context.Context, order *Order, payload map[string]any) (map[string]any, error) {
	return map[string]any{"ready_to_ship": true}, nil
}

func handleOrderShipped(ctx context.Context, order *Order, payload map[string]any) (map[string]any, error) {
	return map[string]any{"shipped": true}, nil
}

func handleWithError(ctx context.Context, order *Order, payload map[string]any) (map[string]any, error) {
	return nil, errors.New("handler error")
}

// setupTestWorkflow creates a test workflow definition
func setupTestWorkflow(entityService *MockEntityService, broker *MockBrokerPublisher) *WorkflowDefinition[*Order, OrderEvent, OrderState] {
	return NewWorkflowBuilder[*Order, OrderEvent, OrderState]("TestOrderWorkflow").
		SetStates(WorkflowStates[OrderState]{
			Finals: []OrderState{OrderStateShipped},
			Idles:  []OrderState{OrderStatePending},
			Failed: OrderStateFailed,
		}).
		AddTransition(Transition[*Order, OrderEvent, OrderState]{
			Event: OrderEventCreated,
			From:  []OrderState{OrderStatePending},
			To:    OrderStateProcessing,
			Conditions: []ConditionFunc[*Order]{
				func(order *Order, payload map[string]any) bool {
					approved, _ := payload["approved"].(bool)
					return approved
				},
			},
		}).
		AddTransition(Transition[*Order, OrderEvent, OrderState]{
			Event: OrderEventProcessing,
			From:  []OrderState{OrderStateProcessing},
			To:    OrderStateShipped,
			Conditions: []ConditionFunc[*Order]{
				func(order *Order, payload map[string]any) bool {
					// Only transition if explicitly triggered by event
					// This prevents automatic transition
					ready, _ := payload["ready_to_ship"].(bool)
					return ready
				},
			},
		}).
		OnEvent(OrderEventCreated, handleOrderCreated).
		OnEvent(OrderEventProcessing, handleOrderProcessing).
		OnEvent(OrderEventShipped, handleOrderShipped).
		WithEntityService(entityService).
		WithBrokerPublisher(broker).
		Build()
}

func TestWorkflowBuilder(t *testing.T) {
	t.Run("builds valid workflow", func(t *testing.T) {
		mockEntity := NewMockEntityService()
		mockBroker := &MockBrokerPublisher{}

		def := setupTestWorkflow(mockEntity, mockBroker)

		if def.Name != "TestOrderWorkflow" {
			t.Errorf("expected name 'TestOrderWorkflow', got '%s'", def.Name)
		}

		if len(def.Transitions) != 2 {
			t.Errorf("expected 2 transitions, got %d", len(def.Transitions))
		}

		if len(def.Handlers) != 3 {
			t.Errorf("expected 3 handlers, got %d", len(def.Handlers))
		}
	})

	t.Run("panics on invalid workflow", func(t *testing.T) {
		defer func() {
			if r := recover(); r == nil {
				t.Error("expected panic for workflow without entity service")
			}
		}()

		NewWorkflowBuilder[*Order, OrderEvent, OrderState]("Invalid").
			AddTransition(Transition[*Order, OrderEvent, OrderState]{
				Event: OrderEventCreated,
				From:  []OrderState{OrderStatePending},
				To:    OrderStateProcessing,
			}).
			OnEvent(OrderEventCreated, handleOrderCreated).
			Build()
	})

	t.Run("panics when handler missing for transition", func(t *testing.T) {
		defer func() {
			if r := recover(); r == nil {
				t.Error("expected panic for transition without handler")
			}
		}()

		mockEntity := NewMockEntityService()

		NewWorkflowBuilder[*Order, OrderEvent, OrderState]("Invalid").
			AddTransition(Transition[*Order, OrderEvent, OrderState]{
				Event: OrderEventCreated,
				From:  []OrderState{OrderStatePending},
				To:    OrderStateProcessing,
			}).
			WithEntityService(mockEntity).
			Build()
	})
}

func TestOrchestrator_Transit(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	tests := []struct {
		name          string
		initialOrder  *Order
		event         WorkflowEvent
		wantState     OrderState
		wantErr       bool
		errType       error
	}{
		{
			name: "successful transition from pending to processing",
			initialOrder: &Order{
				ID:     "test-1",
				URN:    "order:test-1",
				Items:  []string{"item1"},
				Status: OrderStatePending,
			},
			event: WorkflowEvent{
				Topic:   string(OrderEventCreated),
				URN:     "order:test-1",
				Payload: map[string]any{"approved": true},
			},
			wantState: OrderStateProcessing,
			wantErr:   false,
		},
		{
			name: "stays idle when condition not met",
			initialOrder: &Order{
				ID:     "test-2",
				URN:    "order:test-2",
				Items:  []string{"item1"},
				Status: OrderStatePending,
			},
			event: WorkflowEvent{
				Topic:   string(OrderEventCreated),
				URN:     "order:test-2",
				Payload: map[string]any{"approved": false},
			},
			wantState: OrderStatePending,
			wantErr:   false, // No error - just stays in idle state
		},
		{
			name: "stays in idle state when no valid transition",
			initialOrder: &Order{
				ID:     "test-3",
				URN:    "order:test-3",
				Items:  []string{"item1"},
				Status: OrderStatePending,
			},
			event: WorkflowEvent{
				Topic:   string(OrderEventProcessing),
				URN:     "order:test-3",
				Payload: map[string]any{},
			},
			wantState: OrderStatePending,
			wantErr:   false,
		},
		{
			name: "entity not found",
			initialOrder: &Order{
				ID:     "test-4",
				URN:    "order:test-4",
				Items:  []string{"item1"},
				Status: OrderStatePending,
			},
			event: WorkflowEvent{
				Topic:   string(OrderEventCreated),
				URN:     "order:not-found",
				Payload: map[string]any{"approved": true},
			},
			wantState: OrderStatePending,
			wantErr:   true,
			errType:   ErrEntityNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockEntity := NewMockEntityService()
			mockBroker := &MockBrokerPublisher{}

			// Setup initial entity
			mockEntity.entities[tt.initialOrder.URN] = tt.initialOrder

			// Create workflow and orchestrator
			workflow := setupTestWorkflow(mockEntity, mockBroker)
			orchestrator := NewOrchestrator(logger)
			orchestrator.Register(workflow.AsInterface())

			// Execute transition
			err := orchestrator.Transit(context.Background(), tt.event)

			// Check error
			if (err != nil) != tt.wantErr {
				t.Errorf("Transit() error = %v, wantErr %v", err, tt.wantErr)
			}

			if tt.errType != nil && !errors.Is(err, tt.errType) {
				t.Errorf("expected error type %v, got %v", tt.errType, err)
			}

			// Check final state
			if entity, ok := mockEntity.entities[tt.initialOrder.URN]; ok {
				if entity.Status != tt.wantState {
					t.Errorf("expected state %v, got %v", tt.wantState, entity.Status)
				}
			}
		})
	}
}

func TestOrchestrator_AutomaticTransitions(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	t.Run("automatic transition to shipped", func(t *testing.T) {
		mockEntity := NewMockEntityService()
		mockBroker := &MockBrokerPublisher{}

		// Create workflow with automatic transition
		workflow := NewWorkflowBuilder[*Order, OrderEvent, OrderState]("AutoTransitionWorkflow").
			SetStates(WorkflowStates[OrderState]{
				Finals: []OrderState{OrderStateShipped},
				Idles:  []OrderState{OrderStatePending},
				Failed: OrderStateFailed,
			}).
			AddTransition(Transition[*Order, OrderEvent, OrderState]{
				Event: OrderEventCreated,
				From:  []OrderState{OrderStatePending},
				To:    OrderStateProcessing,
			}).
			AddTransition(Transition[*Order, OrderEvent, OrderState]{
				Event: OrderEventProcessing,
				From:  []OrderState{OrderStateProcessing},
				To:    OrderStateShipped,
				// No event check - automatic transition
			}).
			OnEvent(OrderEventCreated, handleOrderCreated).
			OnEvent(OrderEventProcessing, handleOrderProcessing).
			WithEntityService(mockEntity).
			WithBrokerPublisher(mockBroker).
			Build()

		orchestrator := NewOrchestrator(logger)
		orchestrator.Register(workflow.AsInterface())

		// Setup initial order
		order := &Order{
			ID:     "auto-1",
			URN:    "order:auto-1",
			Items:  []string{"item1"},
			Status: OrderStatePending,
		}
		mockEntity.entities[order.URN] = order

		// Trigger initial event
		event := WorkflowEvent{
			Topic:   string(OrderEventCreated),
			URN:     order.URN,
			Payload: map[string]any{},
		}

		err := orchestrator.Transit(context.Background(), event)
		if err != nil {
			t.Fatalf("Transit() failed: %v", err)
		}

		// Should have automatically transitioned to shipped
		finalOrder := mockEntity.entities[order.URN]
		if finalOrder.Status != OrderStateShipped {
			t.Errorf("expected automatic transition to %v, got %v", OrderStateShipped, finalOrder.Status)
		}
	})
}

func TestOrchestrator_ErrorHandling(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	t.Run("handler error transitions to failed state", func(t *testing.T) {
		mockEntity := NewMockEntityService()
		mockBroker := &MockBrokerPublisher{}

		// Create workflow with failing handler
		workflow := NewWorkflowBuilder[*Order, OrderEvent, OrderState]("ErrorWorkflow").
			SetStates(WorkflowStates[OrderState]{
				Finals: []OrderState{OrderStateShipped},
				Idles:  []OrderState{OrderStatePending},
				Failed: OrderStateFailed,
			}).
			AddTransition(Transition[*Order, OrderEvent, OrderState]{
				Event: OrderEventCreated,
				From:  []OrderState{OrderStatePending},
				To:    OrderStateProcessing,
			}).
			OnEvent(OrderEventCreated, handleWithError).
			WithEntityService(mockEntity).
			WithBrokerPublisher(mockBroker).
			Build()

		orchestrator := NewOrchestrator(logger)
		orchestrator.Register(workflow.AsInterface())

		order := &Order{
			ID:     "error-1",
			URN:    "order:error-1",
			Items:  []string{"item1"},
			Status: OrderStatePending,
		}
		mockEntity.entities[order.URN] = order

		event := WorkflowEvent{
			Topic:   string(OrderEventCreated),
			URN:     order.URN,
			Payload: map[string]any{},
		}

		err := orchestrator.Transit(context.Background(), event)
		if err == nil {
			t.Fatal("expected error from handler")
		}

		// Should have transitioned to failed state
		finalOrder := mockEntity.entities[order.URN]
		if finalOrder.Status != OrderStateFailed {
			t.Errorf("expected state %v after error, got %v", OrderStateFailed, finalOrder.Status)
		}
	})

	t.Run("unretriable error is detected", func(t *testing.T) {
		mockEntity := NewMockEntityService()
		mockBroker := &MockBrokerPublisher{}

		workflow := setupTestWorkflow(mockEntity, mockBroker)
		orchestrator := NewOrchestrator(logger)
		orchestrator.Register(workflow.AsInterface())

		// Order without items triggers unretriable error
		order := &Order{
			ID:     "unretriable-1",
			URN:    "order:unretriable-1",
			Items:  []string{}, // Empty items
			Status: OrderStatePending,
		}
		mockEntity.entities[order.URN] = order

		event := WorkflowEvent{
			Topic:   string(OrderEventCreated),
			URN:     order.URN,
			Payload: map[string]any{"approved": true},
		}

		err := orchestrator.Transit(context.Background(), event)
		if err == nil {
			t.Fatal("expected unretriable error")
		}

		if !IsUnretriable(err) {
			t.Error("expected error to be unretriable")
		}
	})
}

func TestRegistry(t *testing.T) {
	t.Run("register and get workflow", func(t *testing.T) {
		registry := NewRegistry()
		mockEntity := NewMockEntityService()
		workflow := setupTestWorkflow(mockEntity, nil)

		registry.Register(workflow.AsInterface())

		retrieved, err := registry.Get("TestOrderWorkflow")
		if err != nil {
			t.Fatalf("Get() failed: %v", err)
		}

		if retrieved.GetName() != "TestOrderWorkflow" {
			t.Errorf("expected workflow name 'TestOrderWorkflow', got '%s'", retrieved.GetName())
		}
	})

	t.Run("get non-existent workflow returns error", func(t *testing.T) {
		registry := NewRegistry()

		_, err := registry.Get("NonExistent")
		if !errors.Is(err, ErrWorkflowNotFound) {
			t.Errorf("expected ErrWorkflowNotFound, got %v", err)
		}
	})

	t.Run("list workflows", func(t *testing.T) {
		registry := NewRegistry()
		mockEntity := NewMockEntityService()

		workflow1 := setupTestWorkflow(mockEntity, nil)
		workflow2 := NewWorkflowBuilder[*Order, OrderEvent, OrderState]("Workflow2").
			AddTransition(Transition[*Order, OrderEvent, OrderState]{
				Event: OrderEventCreated,
				From:  []OrderState{OrderStatePending},
				To:    OrderStateProcessing,
			}).
			OnEvent(OrderEventCreated, handleOrderCreated).
			WithEntityService(mockEntity).
			Build()

		registry.Register(workflow1.AsInterface())
		registry.Register(workflow2.AsInterface())

		names := registry.List()
		if len(names) != 2 {
			t.Errorf("expected 2 workflows, got %d", len(names))
		}
	})
}
