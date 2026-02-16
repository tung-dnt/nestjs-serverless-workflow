package core

import "context"

// EntityService defines the interface for entity persistence and state management
// E is the entity type, S is the state type
type EntityService[E Entity, S State] interface {
	// Create creates a new entity with initial state
	Create(ctx context.Context) (E, error)

	// Load retrieves an entity by its URN (Uniform Resource Name)
	Load(ctx context.Context, urn string) (E, error)

	// Update updates the entity's state and persists it
	Update(ctx context.Context, entity E, status S) (E, error)

	// Status returns the current state of the entity
	Status(entity E) S

	// URN returns the unique identifier for the entity
	URN(entity E) string
}
