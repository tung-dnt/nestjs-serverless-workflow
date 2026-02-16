package eventbus

import (
	"github.com/tung-dnt/nestjs-serverless-workflow/workflow/core"
)

// Publisher defines the interface for publishing workflow events
// This is an alias to core.BrokerPublisher for backward compatibility
type Publisher interface {
	core.BrokerPublisher
}

// PublisherConfig holds configuration for event publishers
type PublisherConfig struct {
	// QueueURL is the SQS queue URL for publishing events
	QueueURL string

	// MaxRetries is the maximum number of retry attempts
	MaxRetries int

	// EnableBatching enables batch message publishing
	EnableBatching bool

	// BatchSize is the number of messages to batch together
	BatchSize int
}

// DefaultConfig returns default publisher configuration
func DefaultConfig() PublisherConfig {
	return PublisherConfig{
		MaxRetries:     3,
		EnableBatching: false,
		BatchSize:      10,
	}
}
