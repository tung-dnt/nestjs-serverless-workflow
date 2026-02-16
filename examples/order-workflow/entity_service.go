package main

import (
	"context"
	"log/slog"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

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
