package core

import "fmt"

// WorkflowBuilder provides a fluent API for constructing workflow definitions
type WorkflowBuilder[E Entity, Ev Event, S State] struct {
	def *WorkflowDefinition[E, Ev, S]
}

// NewWorkflowBuilder creates a new workflow builder with the given name
func NewWorkflowBuilder[E Entity, Ev Event, S State](name string) *WorkflowBuilder[E, Ev, S] {
	return &WorkflowBuilder[E, Ev, S]{
		def: &WorkflowDefinition[E, Ev, S]{
			Name:        name,
			Handlers:    make(map[Ev]HandlerFunc[E]),
			Transitions: []Transition[E, Ev, S]{},
		},
	}
}

// SetStates configures the workflow states (finals, idles, failed)
func (b *WorkflowBuilder[E, Ev, S]) SetStates(states WorkflowStates[S]) *WorkflowBuilder[E, Ev, S] {
	b.def.States = states
	return b
}

// AddTransition adds a state transition to the workflow
func (b *WorkflowBuilder[E, Ev, S]) AddTransition(transition Transition[E, Ev, S]) *WorkflowBuilder[E, Ev, S] {
	b.def.Transitions = append(b.def.Transitions, transition)
	return b
}

// AddTransitions adds multiple transitions at once
func (b *WorkflowBuilder[E, Ev, S]) AddTransitions(transitions ...Transition[E, Ev, S]) *WorkflowBuilder[E, Ev, S] {
	b.def.Transitions = append(b.def.Transitions, transitions...)
	return b
}

// OnEvent registers an event handler for the given event
func (b *WorkflowBuilder[E, Ev, S]) OnEvent(event Ev, handler HandlerFunc[E]) *WorkflowBuilder[E, Ev, S] {
	b.def.Handlers[event] = handler
	return b
}

// WithEntityService sets the entity service for this workflow
func (b *WorkflowBuilder[E, Ev, S]) WithEntityService(service EntityService[E, S]) *WorkflowBuilder[E, Ev, S] {
	b.def.Entity = service
	return b
}

// WithBrokerPublisher sets the broker for publishing events
func (b *WorkflowBuilder[E, Ev, S]) WithBrokerPublisher(broker BrokerPublisher) *WorkflowBuilder[E, Ev, S] {
	b.def.Broker = broker
	return b
}

// Build validates and returns the final workflow definition
func (b *WorkflowBuilder[E, Ev, S]) Build() *WorkflowDefinition[E, Ev, S] {
	// Validate the workflow definition
	if err := b.validate(); err != nil {
		panic(fmt.Sprintf("invalid workflow definition: %v", err))
	}

	return b.def
}

// validate checks that the workflow definition is valid
func (b *WorkflowBuilder[E, Ev, S]) validate() error {
	if b.def.Name == "" {
		return fmt.Errorf("%w: workflow name is required", ErrInvalidWorkflowDefinition)
	}

	if b.def.Entity == nil {
		return fmt.Errorf("%w: entity service is required", ErrInvalidWorkflowDefinition)
	}

	if len(b.def.Transitions) == 0 {
		return fmt.Errorf("%w: at least one transition is required", ErrInvalidWorkflowDefinition)
	}

	// Validate that all transitions have handlers
	for _, transition := range b.def.Transitions {
		if _, ok := b.def.Handlers[transition.Event]; !ok {
			return fmt.Errorf("%w: no handler registered for event %v", ErrInvalidWorkflowDefinition, transition.Event)
		}
	}

	return nil
}
