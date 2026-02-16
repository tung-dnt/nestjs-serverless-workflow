package core

// TransitionBuilder provides a fluent API for building state transitions
type TransitionBuilder[E Entity, Ev Event, S State] struct {
	transition Transition[E, Ev, S]
}

// On starts a new transition definition for the given event
// The callback function receives a TransitionBuilder to configure the transition
func (b *WorkflowBuilder[E, Ev, S]) On(event Ev, configure func(*TransitionBuilder[E, Ev, S])) *WorkflowBuilder[E, Ev, S] {
	tb := &TransitionBuilder[E, Ev, S]{
		transition: Transition[E, Ev, S]{
			Event:      event,
			From:       []S{},
			Conditions: []ConditionFunc[E]{},
			Handlers:   []HandlerFunc[E]{},
		},
	}

	// Execute the configuration callback
	configure(tb)

	// Add the configured transition to the workflow
	b.def.Transitions = append(b.def.Transitions, tb.transition)
	return b
}

// From specifies a single source state for the transition
func (tb *TransitionBuilder[E, Ev, S]) From(state S) *TransitionBuilder[E, Ev, S] {
	tb.transition.From = []S{state}
	return tb
}

// FromAny specifies multiple source states for the transition
func (tb *TransitionBuilder[E, Ev, S]) FromAny(states ...S) *TransitionBuilder[E, Ev, S] {
	tb.transition.From = states
	return tb
}

// To specifies the destination state for the transition
func (tb *TransitionBuilder[E, Ev, S]) To(state S) *TransitionBuilder[E, Ev, S] {
	tb.transition.To = state
	return tb
}

// When adds a condition that must be satisfied for the transition to occur
func (tb *TransitionBuilder[E, Ev, S]) When(condition ConditionFunc[E]) *TransitionBuilder[E, Ev, S] {
	tb.transition.Conditions = append(tb.transition.Conditions, condition)
	return tb
}

// WhenAll adds multiple conditions that must all be satisfied (AND logic)
func (tb *TransitionBuilder[E, Ev, S]) WhenAll(conditions ...ConditionFunc[E]) *TransitionBuilder[E, Ev, S] {
	tb.transition.Conditions = append(tb.transition.Conditions, And(conditions...))
	return tb
}

// WhenAny adds multiple conditions where at least one must be satisfied (OR logic)
func (tb *TransitionBuilder[E, Ev, S]) WhenAny(conditions ...ConditionFunc[E]) *TransitionBuilder[E, Ev, S] {
	tb.transition.Conditions = append(tb.transition.Conditions, Or(conditions...))
	return tb
}

// Handle adds a single handler function
func (tb *TransitionBuilder[E, Ev, S]) Handle(handler HandlerFunc[E]) {
	tb.transition.Handlers = []HandlerFunc[E]{handler}
}

// HandleAll adds multiple handler functions (executed in parallel with fanout pattern)
func (tb *TransitionBuilder[E, Ev, S]) HandleAll(handlers ...HandlerFunc[E]) {
	tb.transition.Handlers = handlers
}
