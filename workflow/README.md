# Go Workflow Engine

A high-performance, serverless-optimized workflow orchestration library written in Go. This is a rewrite of the NestJS Serverless Workflow library with significant performance improvements for AWS Lambda environments.

## Features

- ✅ **Generic Type-Safe Workflows** - Compile-time type safety with Go generics
- ✅ **State Machine Orchestration** - Automatic state transitions with condition support
- ✅ **Event-Driven Architecture** - Message broker abstraction for async workflows
- ✅ **Lambda-Optimized** - Context-aware timeout handling and graceful shutdown
- ✅ **Error Handling** - Automatic failed state transitions with retryable/unretriable classification
- ✅ **Idle State Support** - Workflows pause in idle states until next event
- ✅ **Final State Detection** - Automatic workflow completion

## Performance Targets

| Metric | NestJS | Go | Improvement |
|--------|--------|----|----- |
| Cold Start | 500-1500ms | 100-200ms | **5-10x faster** |
| Memory | 128-256MB | 64-128MB | **50-70% reduction** |
| Throughput | 500-1000 evt/s | 1500-3000 evt/s | **2-3x improvement** |

## Architecture

```
workflow/
├── core/           # Core workflow engine
│   ├── workflow.go    # Type definitions and interfaces
│   ├── builder.go     # Fluent workflow builder
│   ├── orchestrator.go # Execution engine
│   ├── entity.go      # Entity service interface
│   ├── registry.go    # Workflow registration
│   └── errors.go      # Error types
├── eventbus/       # Event publishing (Phase 2)
├── adapter/        # Lambda adapter (Phase 2)
├── saga/           # SAGA pattern (Phase 3)
└── retry/          # Retry strategies (Phase 3)
```

## Quick Start

### Define Your Types

```go
// State enum
type OrderState string
const (
    OrderStatePending    OrderState = "pending"
    OrderStateProcessing OrderState = "processing"
    OrderStateShipped    OrderState = "shipped"
    OrderStateFailed     OrderState = "failed"
)

// Event enum
type OrderEvent string
const (
    OrderEventCreated OrderEvent = "order.created"
    OrderEventProcessing OrderEvent = "order.processing"
)

// Entity
type Order struct {
    ID     string
    Items  []string
    Status OrderState
}
```

### Implement Entity Service

```go
type OrderEntityService struct {
    db *dynamodb.Client
}

func (s *OrderEntityService) Load(ctx context.Context, urn string) (*Order, error) {
    // Load from DynamoDB
}

func (s *OrderEntityService) Update(ctx context.Context, order *Order, status OrderState) (*Order, error) {
    order.Status = status
    // Save to DynamoDB
    return order, nil
}

func (s *OrderEntityService) Status(order *Order) OrderState {
    return order.Status
}

func (s *OrderEntityService) URN(order *Order) string {
    return "order:" + order.ID
}
```

### Define Workflow

```go
func NewOrderWorkflow(
    entityService EntityService[*Order, OrderState],
    broker BrokerPublisher,
) *WorkflowDefinition[*Order, OrderEvent, OrderState] {

    return NewWorkflowBuilder[*Order, OrderEvent, OrderState]("OrderWorkflow").
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
        }).
        OnEvent(OrderEventCreated, handleCreated).
        OnEvent(OrderEventProcessing, handleProcessing).
        WithEntityService(entityService).
        WithBrokerPublisher(broker).
        Build()
}

// Event handlers
func handleCreated(ctx context.Context, order *Order, payload map[string]any) (map[string]any, error) {
    if len(order.Items) == 0 {
        return nil, fmt.Errorf("%w: order must have items", ErrUnretriable)
    }
    return map[string]any{"validated": true}, nil
}

func handleProcessing(ctx context.Context, order *Order, payload map[string]any) (map[string]any, error) {
    // Process order logic
    return map[string]any{"shipped": true}, nil
}
```

### Execute Workflow

```go
func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

    // Create dependencies
    entityService := NewOrderEntityService(dynamoClient)
    broker := NewSQSBroker(sqsClient, "order-queue")

    // Build workflow
    workflow := NewOrderWorkflow(entityService, broker)

    // Create orchestrator
    orchestrator := NewOrchestrator(logger)
    orchestrator.Register(workflow.AsInterface())

    // Process event
    event := WorkflowEvent{
        Topic:   "order.created",
        URN:     "order:123",
        Payload: map[string]any{"approved": true},
    }

    if err := orchestrator.Transit(context.Background(), event); err != nil {
        logger.Error("workflow failed", "error", err)
    }
}
```

## Automatic Transitions

The orchestrator supports automatic state progressions:

```go
// Define transitions without event requirements
AddTransition(Transition[*Order, OrderEvent, OrderState]{
    Event: OrderEventProcessing, // Still needed for handler lookup
    From:  []OrderState{OrderStateProcessing},
    To:    OrderStateShipped,
    // No conditions = always auto-transition
})
```

When a handler completes and the entity is not in a final or idle state, the orchestrator automatically looks for the next valid transition (with `skipEventCheck=true`).

## Error Handling

### Unretriable Errors

Mark errors that should not be retried:

```go
if order.Items == nil {
    return nil, fmt.Errorf("%w: invalid order", ErrUnretriable)
}
```

### Failed State

On handler errors, the entity automatically transitions to the failed state:

```go
SetStates(WorkflowStates[OrderState]{
    Failed: OrderStateFailed, // Entity moves here on errors
})
```

## Testing

Run tests with coverage:

```bash
go test -v -cover ./workflow/core
```

Current coverage: **82.5%** ✅

### Test Example

```go
func TestWorkflow(t *testing.T) {
    mockEntity := NewMockEntityService()
    workflow := setupTestWorkflow(mockEntity, nil)
    orchestrator := NewOrchestrator(slog.Default())
    orchestrator.Register(workflow.AsInterface())

    event := WorkflowEvent{
        Topic: "order.created",
        URN: "order:test-1",
        Payload: map[string]any{"approved": true},
    }

    err := orchestrator.Transit(context.Background(), event)
    assert.NoError(t, err)
}
```

## Implementation Status

### ✅ Phase 1: Core Infrastructure (COMPLETED)

- [x] Core types with Go generics
- [x] Workflow builder pattern
- [x] Orchestrator engine with automatic transitions
- [x] Registry for workflow management
- [x] Entity service interface
- [x] Error handling (retryable/unretriable)
- [x] Unit tests (82.5% coverage)

### 🚧 Phase 2: Event Bus & Lambda (Next)

- [ ] BrokerPublisher interface
- [ ] SQS emitter implementation
- [ ] Lambda handler with context deadlines
- [ ] Batch failure handling
- [ ] Integration tests with LocalStack

### 📋 Phase 3: SAGA & Retry

- [ ] SAGA coordinator
- [ ] Compensation strategies
- [ ] History store (DynamoDB)
- [ ] Retry backoff algorithms

### 📋 Phase 4: Examples & Documentation

- [ ] Order workflow example
- [ ] Payment workflow example
- [ ] Performance benchmarks
- [ ] Migration guide from NestJS

## Design Decisions

### Why Builder Pattern Instead of Decorators?

Go doesn't support decorators or runtime reflection for metadata. The builder pattern provides:

- Compile-time type safety
- Explicit, debuggable code
- Zero runtime reflection overhead
- IDE autocomplete support

### Why Interface Adapter Pattern?

The `WorkflowDefinitionInterface` allows the orchestrator to work with workflows of different generic types:

```go
orchestrator.Register(workflow1.AsInterface()) // Order workflow
orchestrator.Register(workflow2.AsInterface()) // Payment workflow
```

Without this, the orchestrator would need to be generic over all possible type combinations.

### Why Fixed Handler Signature?

NestJS allows flexible parameter order via decorators. Go requires fixed signatures:

```go
func(ctx context.Context, entity E, payload map[string]any) (map[string]any, error)
```

This trades flexibility for explicitness and compile-time safety.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

## License

MIT - See [LICENSE](../LICENSE)
