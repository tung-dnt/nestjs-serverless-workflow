package main

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/tung-dnt/nestjs-serverless-workflow/packages/core"
)

// OrderWorkflow implements the order processing workflow
type OrderWorkflow struct {
	entityService *OrderEntityService
	broker        core.BrokerPublisher
	logger        *slog.Logger
}

func NewOrderWorkflow(
	entityService *OrderEntityService, 
	broker core.BrokerPublisher, 
	logger *slog.Logger,
) *OrderWorkflow {
	return &OrderWorkflow{
		entityService: entityService,
		broker:        broker,
		logger:        logger,
	}
}

// Handler functions
func (w *OrderWorkflow) HandleCreated(
	ctx context.Context,
	order *Order,
	payload map[string]any,
) (map[string]any, error) {
	w.logger.Info("handling order created",
		"orderId", order.ID,
		"totalAmount", order.TotalAmount,
	)

	// Validate order
	if len(order.Items) == 0 {
		return nil, fmt.Errorf("%w: order must have at least one item", core.ErrUnretriable)
	}

	if order.TotalAmount <= 0 {
		return nil, fmt.Errorf("%w: order total must be positive", core.ErrUnretriable)
	}

	// Check if auto-approved (orders under $100)
	autoApproved := order.TotalAmount < 100.00

	return map[string]any{
		"validated":    true,
		"autoApproved": autoApproved,
	}, nil
}

func (w *OrderWorkflow) HandleProcessing(
	ctx context.Context,
	order *Order,
	payload map[string]any,
) (map[string]any, error) {
	w.logger.Info("processing order",
		"orderId", order.ID,
		"itemCount", len(order.Items),
	)

	// In a real implementation:
	// - Reserve inventory
	// - Process payment
	// - Create shipment

	return map[string]any{
		"processed":   true,
		"readyToShip": true,
		"shipmentId":  "SHIP-" + order.ID,
	}, nil
}

func (w *OrderWorkflow) HandleShipped(
	ctx context.Context,
	order *Order,
	payload map[string]any,
) (map[string]any, error) {
	w.logger.Info("order shipped",
		"orderId", order.ID,
		"shipmentId", payload["shipmentId"],
	)

	// Send confirmation email, update tracking, etc.

	return map[string]any{
		"completed": true,
	}, nil
}

func (w *OrderWorkflow) HandleCancelled(
	ctx context.Context,
	order *Order,
	payload map[string]any,
) (map[string]any, error) {
	w.logger.Info("order cancelled",
		"orderId", order.ID,
		"reason", payload["reason"],
	)

	// Refund payment, restore inventory, etc.

	return map[string]any{
		"cancelled": true,
	}, nil
}

// Definition returns the workflow definition
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
