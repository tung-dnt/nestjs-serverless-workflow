package core

import "errors"

// Sentinel errors for workflow operations
var (
	// ErrUnretriable indicates an error that should not be retried
	ErrUnretriable = errors.New("unretriable error")

	// ErrEntityNotFound indicates the entity could not be found
	ErrEntityNotFound = errors.New("entity not found")

	// ErrInvalidTransition indicates the transition is not valid for the current state
	ErrInvalidTransition = errors.New("invalid transition")

	// ErrNoValidTransition indicates no valid transition was found
	ErrNoValidTransition = errors.New("no valid transition found")

	// ErrWorkflowNotFound indicates the workflow definition was not found
	ErrWorkflowNotFound = errors.New("workflow not found")

	// ErrHandlerNotFound indicates the handler for an event was not found
	ErrHandlerNotFound = errors.New("handler not found")

	// ErrInvalidWorkflowDefinition indicates the workflow definition is invalid
	ErrInvalidWorkflowDefinition = errors.New("invalid workflow definition")
)

// IsUnretriable checks if an error is unretriable
func IsUnretriable(err error) bool {
	return errors.Is(err, ErrUnretriable)
}

// IsEntityNotFound checks if an error is entity not found
func IsEntityNotFound(err error) bool {
	return errors.Is(err, ErrEntityNotFound)
}

// IsInvalidTransition checks if an error is invalid transition
func IsInvalidTransition(err error) bool {
	return errors.Is(err, ErrInvalidTransition)
}
