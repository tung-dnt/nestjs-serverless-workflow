package core

import (
	"context"
	"fmt"
)

// State represents a workflow state type
// Must be comparable to use as map keys and for equality checks
type State interface {
	comparable
}

// Event represents a workflow event type
// Must be comparable to use as map keys and for equality checks
type Event interface {
	comparable
}

// Entity represents any workflow entity
type Entity interface {
	any
}

// HandlerFunc is the signature for event handlers
// Receives context, entity, and payload, returns updated payload and error
type HandlerFunc[E Entity] func(
	ctx context.Context,
	entity E,
	payload map[string]any,
) (map[string]any, error)

// ConditionFunc evaluates whether a transition should occur
type ConditionFunc[E Entity] func(
	entity E,
	payload map[string]any,
) bool

// WorkflowStates defines the state categories for a workflow
type WorkflowStates[S State] struct {
	// Finals are terminal states - workflow completes when reached
	Finals []S

	// Idles are waiting states - workflow pauses until next event
	Idles []S

	// Failed is the error state - workflow transitions here on handler errors
	Failed S
}

// Transition defines a state transition triggered by an event
type Transition[E Entity, Ev Event, S State] struct {
	// Event that triggers this transition
	Event Ev

	// From states where this transition is valid (empty = any state)
	From []S

	// To destination state
	To S

	// Conditions that must be satisfied for transition (AND logic)
	Conditions []ConditionFunc[E]
}

// WorkflowDefinition is the complete definition of a workflow
type WorkflowDefinition[E Entity, Ev Event, S State] struct {
	// Name of the workflow
	Name string

	// States configuration
	States WorkflowStates[S]

	// Transitions defines all possible state transitions
	Transitions []Transition[E, Ev, S]

	// Handlers maps events to handler functions
	Handlers map[Ev]HandlerFunc[E]

	// Entity service for loading and updating entities
	Entity EntityService[E, S]

	// Broker for publishing events (optional)
	Broker BrokerPublisher
}

// WorkflowDefinitionInterface provides type-erased access to workflow definitions
// This allows the orchestrator to work with workflows of different types
type WorkflowDefinitionInterface interface {
	// GetName returns the workflow name
	GetName() string

	// FindValidTransition finds a valid transition for the given conditions
	// If skipEventCheck is true, only state and conditions are checked (for automatic transitions)
	FindValidTransition(entity any, payload map[string]any, event string, skipEventCheck bool) any

	// GetTransitionEvent extracts the event from a transition object
	GetTransitionEvent(transition any) any

	// GetTransitionTargetState extracts the target state from a transition object
	GetTransitionTargetState(transition any) any

	// GetHandler returns the handler for the given event
	GetHandler(event any) (func(context.Context, any, map[string]any) (map[string]any, error), error)

	// LoadEntity loads an entity by URN
	LoadEntity(ctx context.Context, urn string) (any, error)

	// UpdateEntityState updates the entity to the new state
	UpdateEntityState(ctx context.Context, entity any, state any) (any, error)

	// GetCurrentState returns the current state of the entity
	GetCurrentState(entity any) any

	// IsFinalState checks if the state is a final state
	IsFinalState(state any) bool

	// IsIdleState checks if the state is an idle state
	IsIdleState(state any) bool

	// GetFailedState returns the failed state
	GetFailedState() any

	// PublishEvent publishes an event to the broker
	PublishEvent(ctx context.Context, event WorkflowEvent) error
}

// WorkflowEvent represents an event flowing through the system
type WorkflowEvent struct {
	// Topic is the event name (e.g., "order.created")
	Topic string

	// URN uniquely identifies the entity
	URN string

	// Payload contains event data
	Payload map[string]any

	// WorkflowName identifies which workflow should handle this event (optional)
	WorkflowName string
}

// BrokerPublisher defines the interface for publishing events
type BrokerPublisher interface {
	Emit(ctx context.Context, event WorkflowEvent) error
}

// Ensure WorkflowDefinition implements WorkflowDefinitionInterface at compile time
var _ WorkflowDefinitionInterface = (*workflowDefinitionAdapter[any, string, string])(nil)

// workflowDefinitionAdapter adapts a generic WorkflowDefinition to the type-erased interface
type workflowDefinitionAdapter[E Entity, Ev Event, S State] struct {
	def *WorkflowDefinition[E, Ev, S]
}

// AsInterface converts a WorkflowDefinition to the type-erased interface
func (w *WorkflowDefinition[E, Ev, S]) AsInterface() WorkflowDefinitionInterface {
	return &workflowDefinitionAdapter[E, Ev, S]{def: w}
}

func (a *workflowDefinitionAdapter[E, Ev, S]) GetName() string {
	return a.def.Name
}

func (a *workflowDefinitionAdapter[E, Ev, S]) FindValidTransition(entity any, payload map[string]any, eventStr string, skipEventCheck bool) any {
	e := entity.(E)

	currentState := a.def.Entity.Status(e)

	for _, t := range a.def.Transitions {
		// Check event match (unless skipping for automatic transitions)
		if !skipEventCheck && eventStr != "" {
			// Compare string representation of the event
			// This works because Event types are typically strings or can be converted to strings
			transitionEventStr := fmt.Sprintf("%v", t.Event)
			if transitionEventStr != eventStr {
				continue
			}
		}

		// Check from state (empty = any state)
		if len(t.From) > 0 {
			validFrom := false
			for _, from := range t.From {
				if from == currentState {
					validFrom = true
					break
				}
			}
			if !validFrom {
				continue
			}
		}

		// Check all conditions
		allConditionsMet := true
		for _, condition := range t.Conditions {
			if !condition(e, payload) {
				allConditionsMet = false
				break
			}
		}

		if allConditionsMet {
			return &t
		}
	}

	return nil
}

func (a *workflowDefinitionAdapter[E, Ev, S]) GetTransitionEvent(transition any) any {
	t := transition.(*Transition[E, Ev, S])
	return t.Event
}

func (a *workflowDefinitionAdapter[E, Ev, S]) GetTransitionTargetState(transition any) any {
	t := transition.(*Transition[E, Ev, S])
	return t.To
}

func (a *workflowDefinitionAdapter[E, Ev, S]) GetHandler(event any) (func(context.Context, any, map[string]any) (map[string]any, error), error) {
	ev := event.(Ev)
	handler, ok := a.def.Handlers[ev]
	if !ok {
		return nil, ErrHandlerNotFound
	}

	// Wrap the typed handler to match the untyped signature
	return func(ctx context.Context, entity any, payload map[string]any) (map[string]any, error) {
		e := entity.(E)
		return handler(ctx, e, payload)
	}, nil
}

func (a *workflowDefinitionAdapter[E, Ev, S]) LoadEntity(ctx context.Context, urn string) (any, error) {
	return a.def.Entity.Load(ctx, urn)
}

func (a *workflowDefinitionAdapter[E, Ev, S]) UpdateEntityState(ctx context.Context, entity any, state any) (any, error) {
	e := entity.(E)
	s := state.(S)
	return a.def.Entity.Update(ctx, e, s)
}

func (a *workflowDefinitionAdapter[E, Ev, S]) GetCurrentState(entity any) any {
	e := entity.(E)
	return a.def.Entity.Status(e)
}

func (a *workflowDefinitionAdapter[E, Ev, S]) IsFinalState(state any) bool {
	s := state.(S)
	for _, final := range a.def.States.Finals {
		if final == s {
			return true
		}
	}
	return false
}

func (a *workflowDefinitionAdapter[E, Ev, S]) IsIdleState(state any) bool {
	s := state.(S)
	for _, idle := range a.def.States.Idles {
		if idle == s {
			return true
		}
	}
	return false
}

func (a *workflowDefinitionAdapter[E, Ev, S]) GetFailedState() any {
	return a.def.States.Failed
}

func (a *workflowDefinitionAdapter[E, Ev, S]) PublishEvent(ctx context.Context, event WorkflowEvent) error {
	if a.def.Broker == nil {
		return nil
	}
	return a.def.Broker.Emit(ctx, event)
}
