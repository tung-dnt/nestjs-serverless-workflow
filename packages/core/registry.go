package core

import (
	"fmt"
	"sync"
)

// Registry manages registered workflow definitions
// Thread-safe storage and lookup of workflows
type Registry struct {
	mu        sync.RWMutex
	workflows map[string]WorkflowDefinitionInterface
}

// NewRegistry creates a new workflow registry
func NewRegistry() *Registry {
	return &Registry{
		workflows: make(map[string]WorkflowDefinitionInterface),
	}
}

// Register adds a workflow definition to the registry
func (r *Registry) Register(def WorkflowDefinitionInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()

	name := def.GetName()
	r.workflows[name] = def
}

// Get retrieves a workflow by name
func (r *Registry) Get(name string) (WorkflowDefinitionInterface, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	workflow, ok := r.workflows[name]
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrWorkflowNotFound, name)
	}

	return workflow, nil
}

// GetByEvent finds a workflow that can handle the given event
// If workflowName is provided, it returns that specific workflow
// Otherwise, it searches all workflows for one that handles the event
func (r *Registry) GetByEvent(event string, workflowName string) (WorkflowDefinitionInterface, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// If workflow name is specified, return it directly
	if workflowName != "" {
		workflow, ok := r.workflows[workflowName]
		if !ok {
			return nil, fmt.Errorf("%w: %s", ErrWorkflowNotFound, workflowName)
		}
		return workflow, nil
	}

	// Otherwise, find any workflow that handles this event
	// Note: This is a simple implementation. In production, you might want
	// to explicitly map events to workflows rather than searching
	for _, workflow := range r.workflows {
		// Try to find a transition with this event
		// This is a simplified check - in reality we'd need to inspect transitions
		// For now, if no workflow name is specified, return the first workflow
		return workflow, nil
	}

	return nil, fmt.Errorf("%w: no workflow found for event %s", ErrWorkflowNotFound, event)
}

// List returns all registered workflow names
func (r *Registry) List() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	names := make([]string, 0, len(r.workflows))
	for name := range r.workflows {
		names = append(names, name)
	}

	return names
}

// Count returns the number of registered workflows
func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return len(r.workflows)
}
