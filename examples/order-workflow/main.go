package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	lambdaadapter "github.com/tung-dnt/nestjs-serverless-workflow/workflow/adapter/lambda"
	"github.com/tung-dnt/nestjs-serverless-workflow/workflow/core"
	sqsemitter "github.com/tung-dnt/nestjs-serverless-workflow/workflow/eventbus/sqs"
)

// OrderState represents the workflow states
type OrderState string

const (
	OrderStatePending    OrderState = "pending"
	OrderStateProcessing OrderState = "processing"
	OrderStateShipped    OrderState = "shipped"
	OrderStateCancelled  OrderState = "cancelled"
	OrderStateFailed     OrderState = "failed"
)

// OrderEvent represents workflow events
type OrderEvent string

const (
	OrderEventCreated    OrderEvent = "order.created"
	OrderEventApproved   OrderEvent = "order.approved"
	OrderEventProcessing OrderEvent = "order.processing"
	OrderEventShipped    OrderEvent = "order.shipped"
	OrderEventCancelled  OrderEvent = "order.cancelled"
)

// Order represents the order entity
type Order struct {
	ID          string            `json:"id" dynamodbav:"id"`
	CustomerID  string            `json:"customerId" dynamodbav:"customerId"`
	Items       []OrderItem       `json:"items" dynamodbav:"items"`
	TotalAmount float64           `json:"totalAmount" dynamodbav:"totalAmount"`
	Status      OrderState        `json:"status" dynamodbav:"status"`
	Metadata    map[string]string `json:"metadata" dynamodbav:"metadata"`
}

type OrderItem struct {
	SKU      string  `json:"sku"`
	Quantity int     `json:"quantity"`
	Price    float64 `json:"price"`
}

// OrderEntityService implements the EntityService interface for DynamoDB
type OrderEntityService struct {
	client    *dynamodb.Client
	tableName string
	logger    *slog.Logger
}

func NewOrderEntityService(client *dynamodb.Client, tableName string, logger *slog.Logger) *OrderEntityService {
	return &OrderEntityService{
		client:    client,
		tableName: tableName,
		logger:    logger,
	}
}

func (s *OrderEntityService) Create(ctx context.Context) (*Order, error) {
	return &Order{
		Status:   OrderStatePending,
		Metadata: make(map[string]string),
	}, nil
}

func (s *OrderEntityService) Load(ctx context.Context, urn string) (*Order, error) {
	// Extract order ID from URN (format: "order:12345")
	orderID := urn[6:] // Remove "order:" prefix

	// In a real implementation, load from DynamoDB
	// For this example, return a mock order
	s.logger.Info("loading order from DynamoDB", "orderId", orderID)

	return &Order{
		ID:          orderID,
		CustomerID:  "customer-123",
		Items:       []OrderItem{{SKU: "ITEM-001", Quantity: 2, Price: 29.99}},
		TotalAmount: 59.98,
		Status:      OrderStatePending,
		Metadata:    make(map[string]string),
	}, nil
}

func (s *OrderEntityService) Update(ctx context.Context, entity *Order, status OrderState) (*Order, error) {
	entity.Status = status
	s.logger.Info("updating order status", "orderId", entity.ID, "newStatus", status)

	// In a real implementation, save to DynamoDB
	// putItem := &dynamodb.PutItemInput{
	//     TableName: aws.String(s.tableName),
	//     Item:      ...,
	// }
	// _, err := s.client.PutItem(ctx, putItem)

	return entity, nil
}

func (s *OrderEntityService) Status(entity *Order) OrderState {
	return entity.Status
}

func (s *OrderEntityService) URN(entity *Order) string {
	return "order:" + entity.ID
}

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

func (w *OrderWorkflow) HandleApproved(
	ctx context.Context,
	order *Order,
	payload map[string]any,
) (map[string]any, error) {
	w.logger.Info("order approved, starting processing",
		"orderId", order.ID,
	)

	// Trigger processing event
	return map[string]any{
		"readyToProcess": true,
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
		"processed":     true,
		"readyToShip":   true,
		"shipmentId":    "SHIP-" + order.ID,
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
		}).
		// Processing -> Shipped (automatic)
		AddTransition(core.Transition[*Order, OrderEvent, OrderState]{
			Event: OrderEventProcessing,
			From:  []OrderState{OrderStateProcessing},
			To:    OrderStateShipped,
			Conditions: []core.ConditionFunc[*Order]{
				func(order *Order, payload map[string]any) bool {
					ready, _ := payload["readyToShip"].(bool)
					return ready
				},
			},
		}).
		// Manual cancellation
		AddTransition(core.Transition[*Order, OrderEvent, OrderState]{
			Event: OrderEventCancelled,
			From:  []OrderState{OrderStatePending, OrderStateProcessing},
			To:    OrderStateCancelled,
		}).
		// Register handlers
		OnEvent(OrderEventCreated, w.HandleCreated).
		OnEvent(OrderEventApproved, w.HandleApproved).
		OnEvent(OrderEventProcessing, w.HandleProcessing).
		OnEvent(OrderEventShipped, w.HandleShipped).
		OnEvent(OrderEventCancelled, w.HandleCancelled).
		WithEntityService(w.entityService).
		WithBrokerPublisher(w.broker).
		Build()
}

func main() {
	// Setup logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	// Load AWS configuration
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		logger.Error("failed to load AWS config", "error", err)
		panic(err)
	}

	// Create AWS clients
	dynamoClient := dynamodb.NewFromConfig(cfg)
	sqsClient := sqs.NewFromConfig(cfg)

	// Get environment variables
	tableName := os.Getenv("ORDERS_TABLE_NAME")
	if tableName == "" {
		tableName = "orders"
	}

	queueURL := os.Getenv("WORKFLOW_QUEUE_URL")
	if queueURL == "" {
		logger.Error("WORKFLOW_QUEUE_URL environment variable is required")
		panic("missing WORKFLOW_QUEUE_URL")
	}

	// Setup dependencies
	entityService := NewOrderEntityService(dynamoClient, tableName, logger)
	sqsBroker := sqsemitter.NewEmitter(sqsClient, queueURL, logger)

	// Create workflow
	orderWorkflow := NewOrderWorkflow(entityService, sqsBroker, logger)

	// Setup orchestrator
	orchestrator := core.NewOrchestrator(logger)
	orchestrator.Register(orderWorkflow.Definition().AsInterface())

	// Create Lambda handler
	handler := lambdaadapter.NewHandler(orchestrator, logger)

	// Start Lambda
	logger.Info("starting order workflow Lambda handler")
	lambda.Start(handler.HandleSQSEvent)
}
