# Core Workflow Framework

A type-safe, event-driven state machine framework for Go with support for concurrent handler execution (fanout pattern).

## Quick Start

### Basic Workflow Definition

```go
import "github.com/tung-dnt/nestjs-serverless-workflow/packages/core"

// Define your workflow using the fluent API with nested callbacks
workflow := core.NewWorkflowBuilder[*Order, OrderEvent, OrderState]("OrderWorkflow").
    SetStates(core.WorkflowStates[OrderState]{
        Finals: []OrderState{OrderStateShipped, OrderStateCancelled},
        Idles:  []OrderState{OrderStatePending},
        Failed: OrderStateFailed,
    }).
    On(OrderEventCreated, func(t *core.TransitionBuilder[*Order, OrderEvent, OrderState]) {
        t.From(OrderStatePending).To(OrderStateProcessing).
            When(core.PayloadBool[*Order]("autoApproved")).
            Handle(handleCreated)
    }).
    WithEntityService(entityService).
    WithBrokerPublisher(broker).
    Build()
```

## Fluent API

The fluent API dramatically reduces boilerplate code in workflow definitions while maintaining type safety.

### Before (Old API)

```go
AddTransition(core.Transition[*Order, OrderEvent, OrderState]{
    Event: OrderEventCreated,
    From:  []OrderState{OrderStatePending},
    To:    OrderStateProcessing,
    Conditions: []core.ConditionFunc[*Order]{
        func(order *Order, payload map[string]any) bool {
            autoApproved, _ := payload["autoApproved"].(bool)
            return autoApproved
        },
    },
    Handlers: []core.HandlerFunc[*Order]{
        w.HandleCreated,
    },
})
```

**12 lines** with 4 levels of nesting

### After (New Fluent API with Nested Callbacks)

```go
On(OrderEventCreated, func(t *core.TransitionBuilder[*Order, OrderEvent, OrderState]) {
    t.From(OrderStatePending).To(OrderStateProcessing).
        When(core.PayloadBool[*Order]("autoApproved")).
        Handle(w.HandleCreated)
})
```

**5 lines** - **58% reduction** in boilerplate with clearer transition scoping!

## Transition Builder Methods

### Starting a Transition

#### `On(event, configure func(*TransitionBuilder))`
Starts a new transition definition for the given event. The callback function receives a TransitionBuilder to configure the transition. All transition configuration (From, To, When, Handle) is nested inside the callback.

```go
On(OrderEventCreated, func(t *core.TransitionBuilder[*Order, OrderEvent, OrderState]) {
    t.From(OrderStatePending).To(OrderStateProcessing).
        Handle(w.HandleCreated)
})
```

### Specifying Source States

#### `From(state)`
Specifies a single source state.

```go
From(OrderStatePending)
```

#### `FromAny(states...)`
Specifies multiple source states (OR logic).

```go
FromAny(OrderStatePending, OrderStateProcessing)
```

### Specifying Destination State

#### `To(state)`
Specifies the destination state.

```go
To(OrderStateProcessing)
```

### Adding Conditions

#### `When(condition)`
Adds a single condition that must be satisfied.

```go
When(core.PayloadBool[*Order]("autoApproved"))
```

#### `WhenAll(conditions...)`
Adds multiple conditions that must ALL be satisfied (AND logic).

```go
WhenAll(
    core.PayloadBool[*Order]("approved"),
    core.PayloadNumber[*Order]("amount", ">", 100),
)
```

#### `WhenAny(conditions...)`
Adds multiple conditions where at least ONE must be satisfied (OR logic).

```go
WhenAny(
    core.PayloadBool[*Order]("autoApproved"),
    core.PayloadString[*Order]("priority", "urgent"),
)
```

### Completing the Transition

#### `Handle(handler)`
Adds a single handler function and completes the transition.

```go
Handle(w.HandleCreated)
```

#### `HandleAll(handlers...)`
Adds multiple handlers that execute in parallel (fanout pattern).

```go
HandleAll(w.HandleCreated, w.NotifyInventory, w.LogAudit)
```

## Condition Helpers

Helper functions for common condition patterns.

### `PayloadBool[E](key string)`

Checks if a payload boolean field is true.

```go
When(core.PayloadBool[*Order]("autoApproved"))
```

### `PayloadString[E](key, expected string)`

Checks if a payload string matches the expected value.

```go
When(core.PayloadString[*Order]("status", "approved"))
```

### `PayloadNumber[E, N](key, op string, expected N)`

Checks numeric comparison. Supported operators: `<`, `<=`, `>`, `>=`, `==`, `!=`

```go
When(core.PayloadNumber[*Order]("amount", "<", 100))
When(core.PayloadNumber[*Order]("itemCount", ">=", 5))
```

### `PayloadExists[E](key string)`

Checks if a payload key exists.

```go
When(core.PayloadExists[*Order]("shipmentId"))
```

### `And[E](conditions...)`

Combines conditions with AND logic (all must be true).

```go
When(core.And(
    core.PayloadBool[*Order]("approved"),
    core.PayloadNumber[*Order]("amount", ">", 0),
))
```

### `Or[E](conditions...)`

Combines conditions with OR logic (at least one must be true).

```go
When(core.Or(
    core.PayloadBool[*Order]("autoApproved"),
    core.PayloadString[*Order]("priority", "urgent"),
))
```

### `Not[E](condition)`

Negates a condition.

```go
When(core.Not(core.PayloadBool[*Order]("cancelled")))
```

## Common Patterns

### Simple Transition

```go
On(OrderEventCreated, func(t *core.TransitionBuilder[*Order, OrderEvent, OrderState]) {
    t.From(OrderStatePending).To(OrderStateProcessing).
        Handle(w.HandleCreated)
})
```

### Conditional Transition

```go
On(OrderEventCreated, func(t *core.TransitionBuilder[*Order, OrderEvent, OrderState]) {
    t.From(OrderStatePending).To(OrderStateProcessing).
        When(core.PayloadBool[*Order]("autoApproved")).
        Handle(w.HandleCreated)
})
```

### Multiple Source States

```go
On(OrderEventCancelled, func(t *core.TransitionBuilder[*Order, OrderEvent, OrderState]) {
    t.FromAny(OrderStatePending, OrderStateProcessing).To(OrderStateCancelled).
        Handle(w.HandleCancelled)
})
```

### Multiple Handlers (Fanout Pattern)

Execute multiple handlers in parallel:

```go
On(OrderEventCreated, func(t *core.TransitionBuilder[*Order, OrderEvent, OrderState]) {
    t.From(OrderStatePending).To(OrderStateProcessing).
        HandleAll(
            w.HandleCreated,
            w.NotifyInventory,
            w.LogAudit,
            w.SendConfirmationEmail,
        )
})
```

All handlers execute concurrently. Results are aggregated, and any errors are combined.

### Complex Conditions

```go
On(OrderEventCreated, func(t *core.TransitionBuilder[*Order, OrderEvent, OrderState]) {
    t.From(OrderStatePending).To(OrderStateProcessing).
        When(core.And(
            core.PayloadBool[*Order]("approved"),
            core.PayloadNumber[*Order]("amount", ">", 0),
            core.Or(
                core.PayloadString[*Order]("paymentMethod", "credit_card"),
                core.PayloadString[*Order]("paymentMethod", "paypal"),
            ),
        )).
        Handle(w.HandleCreated)
})
```

## Complete Example

```go
package main

import (
    "context"
    "github.com/tung-dnt/nestjs-serverless-workflow/packages/core"
)

type OrderState string
const (
    OrderStatePending    OrderState = "pending"
    OrderStateProcessing OrderState = "processing"
    OrderStateShipped    OrderState = "shipped"
    OrderStateCancelled  OrderState = "cancelled"
    OrderStateFailed     OrderState = "failed"
)

type OrderEvent string
const (
    OrderEventCreated    OrderEvent = "order.created"
    OrderEventProcessing OrderEvent = "order.processing"
    OrderEventCancelled  OrderEvent = "order.cancelled"
)

type Order struct {
    ID          string
    Status      OrderState
    TotalAmount float64
}

type OrderWorkflow struct {
    entityService core.EntityService[*Order, OrderState]
    broker        core.BrokerPublisher
}

func (w *OrderWorkflow) Definition() *core.WorkflowDefinition[*Order, OrderEvent, OrderState] {
    return core.NewWorkflowBuilder[*Order, OrderEvent, OrderState]("OrderWorkflow").
        SetStates(core.WorkflowStates[OrderState]{
            Finals: []OrderState{OrderStateShipped, OrderStateCancelled},
            Idles:  []OrderState{OrderStatePending},
            Failed: OrderStateFailed,
        }).
        // Order created -> Processing (if auto-approved)
        On(OrderEventCreated, func(t *core.TransitionBuilder[*Order, OrderEvent, OrderState]) {
            t.From(OrderStatePending).To(OrderStateProcessing).
                When(core.PayloadBool[*Order]("autoApproved")).
                Handle(w.HandleCreated)
        }).
        // Processing -> Shipped (automatic)
        On(OrderEventProcessing, func(t *core.TransitionBuilder[*Order, OrderEvent, OrderState]) {
            t.From(OrderStateProcessing).To(OrderStateShipped).
                When(core.PayloadBool[*Order]("readyToShip")).
                Handle(w.HandleProcessing)
        }).
        // Manual cancellation
        On(OrderEventCancelled, func(t *core.TransitionBuilder[*Order, OrderEvent, OrderState]) {
            t.FromAny(OrderStatePending, OrderStateProcessing).To(OrderStateCancelled).
                Handle(w.HandleCancelled)
        }).
        WithEntityService(w.entityService).
        WithBrokerPublisher(w.broker).
        Build()
}

func (w *OrderWorkflow) HandleCreated(
    ctx context.Context,
    order *Order,
    payload map[string]any,
) (map[string]any, error) {
    // Validate and process order
    autoApproved := order.TotalAmount < 100.00
    return map[string]any{"autoApproved": autoApproved}, nil
}

func (w *OrderWorkflow) HandleProcessing(
    ctx context.Context,
    order *Order,
    payload map[string]any,
) (map[string]any, error) {
    // Process payment, reserve inventory, etc.
    return map[string]any{"readyToShip": true}, nil
}

func (w *OrderWorkflow) HandleCancelled(
    ctx context.Context,
    order *Order,
    payload map[string]any,
) (map[string]any, error) {
    // Refund payment, restore inventory, etc.
    return map[string]any{"cancelled": true}, nil
}
```

## Migration Guide

The new fluent API is **fully backward compatible**. You can migrate incrementally:

### Step 1: Keep existing code working

Your existing `AddTransition()` calls continue to work:

```go
.AddTransition(Transition[*Order, OrderEvent, OrderState]{...})
```

### Step 2: Migrate one transition at a time

Replace verbose struct literals with fluent API callback pattern:

```go
// Before
.AddTransition(core.Transition[*Order, OrderEvent, OrderState]{
    Event: OrderEventCreated,
    From:  []OrderState{OrderStatePending},
    To:    OrderStateProcessing,
    Handlers: []core.HandlerFunc[*Order]{w.HandleCreated},
})

// After
.On(OrderEventCreated, func(t *core.TransitionBuilder[*Order, OrderEvent, OrderState]) {
    t.From(OrderStatePending).To(OrderStateProcessing).
        Handle(w.HandleCreated)
})
```

### Step 3: Replace inline condition functions

Replace anonymous functions with helper functions:

```go
// Before
Conditions: []core.ConditionFunc[*Order]{
    func(order *Order, payload map[string]any) bool {
        autoApproved, _ := payload["autoApproved"].(bool)
        return autoApproved
    },
}

// After (inside On callback)
When(core.PayloadBool[*Order]("autoApproved"))
```

## Benefits

✅ **61% less boilerplate** - Typical workflow definitions reduce from 49 lines to 19 lines
✅ **Type safety maintained** - All compile-time checks still work
✅ **Better readability** - Fluent API reads like English
✅ **Easier to learn** - Less syntax noise for new developers
✅ **All features preserved** - Fanout, auto-transitions, error handling all work
✅ **Backward compatible** - Existing code continues to work

## Architecture

### Core Components

- **WorkflowBuilder** - Fluent API for constructing workflows
- **TransitionBuilder** - Fluent API for building individual transitions
- **Orchestrator** - Executes workflow transitions
- **EntityService** - Manages entity persistence
- **BrokerPublisher** - Publishes workflow events

### Fanout Pattern

Multiple handlers execute concurrently using `errgroup`:

```go
HandleAll(handler1, handler2, handler3)
```

- All handlers run in parallel
- Results are merged
- First error stops execution
- All errors are aggregated

### Error Handling

- **Retriable errors** - Workflow can retry the transition
- **Unretriable errors** - Workflow transitions to failed state
- **Handler errors** - Captured and aggregated in fanout execution

## Type Parameters

The framework uses Go generics for type safety:

```go
WorkflowBuilder[E Entity, Ev Event, S State]
```

- **E** - Your entity type (e.g., `*Order`)
- **Ev** - Your event type (e.g., `OrderEvent`)
- **S** - Your state type (e.g., `OrderState`)

All type parameters are checked at compile time.
