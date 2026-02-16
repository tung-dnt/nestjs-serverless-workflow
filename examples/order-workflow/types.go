package main

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
