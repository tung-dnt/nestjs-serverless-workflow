package core

import (
	"context"
	"fmt"
	"log/slog"
)

// Orchestrator manages workflow execution and event routing
type Orchestrator struct {
	registry *Registry
	logger   *slog.Logger
}

// NewOrchestrator creates a new orchestrator instance
func NewOrchestrator(logger *slog.Logger) *Orchestrator {
	if logger == nil {
		logger = slog.Default()
	}

	return &Orchestrator{
		registry: NewRegistry(),
		logger:   logger,
	}
}

// Register registers a workflow definition with the orchestrator
func (o *Orchestrator) Register(def WorkflowDefinitionInterface) {
	o.registry.Register(def)
	o.logger.Info("workflow registered", "name", def.GetName())
}

// Transit processes a workflow event and executes state transitions
// This is the main entry point for event processing
func (o *Orchestrator) Transit(ctx context.Context, event WorkflowEvent) error {
	o.logger.Info("processing workflow event",
		"topic", event.Topic,
		"urn", event.URN,
		"workflow", event.WorkflowName,
	)

	// Find the workflow definition
	def, err := o.registry.GetByEvent(event.Topic, event.WorkflowName)
	if err != nil {
		o.logger.Error("workflow not found",
			"topic", event.Topic,
			"workflow", event.WorkflowName,
			"error", err,
		)
		return err
	}

	// Execute the workflow
	if err := o.executeWorkflow(ctx, def, event); err != nil {
		o.logger.Error("workflow execution failed",
			"workflow", def.GetName(),
			"urn", event.URN,
			"error", err,
		)
		return err
	}

	o.logger.Info("workflow event processed successfully",
		"workflow", def.GetName(),
		"urn", event.URN,
	)

	return nil
}

// executeWorkflow executes the workflow with automatic state transitions
// Implements the "while loop" pattern from the NestJS version
func (o *Orchestrator) executeWorkflow(
	ctx context.Context,
	def WorkflowDefinitionInterface,
	event WorkflowEvent,
) error {
	// Load the entity
	entity, err := def.LoadEntity(ctx, event.URN)
	if err != nil {
		return fmt.Errorf("failed to load entity: %w", err)
	}

	currentState := def.GetCurrentState(entity)
	o.logger.Debug("entity loaded",
		"urn", event.URN,
		"current_state", currentState,
	)

	// Check if already in a final state
	if def.IsFinalState(currentState) {
		o.logger.Info("entity already in final state, skipping",
			"urn", event.URN,
			"state", currentState,
		)
		return nil
	}

	// Find the initial transition based on the event
	transition := def.FindValidTransition(entity, event.Payload, event.Topic, false)
	if transition == nil {
		// Check if in idle state - this is expected behavior
		if def.IsIdleState(currentState) {
			o.logger.Debug("no valid transition from idle state",
				"urn", event.URN,
				"state", currentState,
				"event", event.Topic,
			)
			return nil
		}

		return fmt.Errorf("%w: event=%s, state=%v", ErrNoValidTransition, event.Topic, currentState)
	}

	stepPayload := event.Payload

	// Execute transitions in a loop until no more automatic transitions
	// This implements the "while loop" pattern for automatic state progression
	for transition != nil {
		// Check context cancellation (e.g., Lambda timeout)
		if err := ctx.Err(); err != nil {
			o.logger.Warn("context cancelled during workflow execution",
				"urn", event.URN,
				"error", err,
			)
			return fmt.Errorf("workflow execution cancelled: %w", err)
		}

		// Get transition event and target state from the transition
		transitionEvent := def.GetTransitionEvent(transition)
		targetState := def.GetTransitionTargetState(transition)

		o.logger.Debug("executing transition",
			"urn", event.URN,
			"event", transitionEvent,
			"from", currentState,
		)

		// Get and execute the handler
		handler, err := def.GetHandler(transitionEvent)
		if err != nil {
			// Update to failed state
			o.updateToFailedState(ctx, def, entity, event.URN, err)
			return fmt.Errorf("handler not found for event %v: %w", transitionEvent, err)
		}

		newPayload, err := handler(ctx, entity, stepPayload)
		if err != nil {
			// Update to failed state on handler error
			o.updateToFailedState(ctx, def, entity, event.URN, err)

			// Check if error is unretriable
			if IsUnretriable(err) {
				o.logger.Error("unretriable error in handler",
					"urn", event.URN,
					"event", transitionEvent,
					"error", err,
				)
				return fmt.Errorf("unretriable handler error: %w", err)
			}

			return fmt.Errorf("handler execution failed: %w", err)
		}

		// Update entity to new state
		entity, err = def.UpdateEntityState(ctx, entity, targetState)
		if err != nil {
			return fmt.Errorf("failed to update entity state: %w", err)
		}

		currentState = def.GetCurrentState(entity)
		o.logger.Info("transition completed",
			"urn", event.URN,
			"new_state", currentState,
		)

		// Check if reached a final state
		if def.IsFinalState(currentState) {
			o.logger.Info("workflow completed - final state reached",
				"urn", event.URN,
				"final_state", currentState,
			)
			break
		}

		// Check if in idle state (wait for next event)
		if def.IsIdleState(currentState) {
			o.logger.Debug("workflow paused in idle state",
				"urn", event.URN,
				"idle_state", currentState,
			)
			break
		}

		// Look for automatic transition (skipEventCheck = true)
		// Use the new payload from the handler
		stepPayload = newPayload
		transition = def.FindValidTransition(entity, stepPayload, "", true)

		if transition != nil {
			o.logger.Debug("automatic transition found",
				"urn", event.URN,
				"from_state", currentState,
			)
		}
	}

	return nil
}

// updateToFailedState updates the entity to the failed state
func (o *Orchestrator) updateToFailedState(
	ctx context.Context,
	def WorkflowDefinitionInterface,
	entity any,
	urn string,
	originalError error,
) {
	failedState := def.GetFailedState()

	o.logger.Error("transitioning to failed state",
		"urn", urn,
		"failed_state", failedState,
		"error", originalError,
	)

	if _, err := def.UpdateEntityState(ctx, entity, failedState); err != nil {
		o.logger.Error("failed to update entity to failed state",
			"urn", urn,
			"error", err,
		)
	}
}
