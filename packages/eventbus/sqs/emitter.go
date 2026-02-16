// Package sqs provides AWS SQS event emitter implementation for the eventbus.
package sqs

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/tung-dnt/nestjs-serverless-workflow/packages/core"
	"github.com/tung-dnt/nestjs-serverless-workflow/packages/eventbus"
)

// SQSClient defines the interface for SQS operations
// This allows mocking in tests
//
//nolint:revive // Keeping SQSClient name for clarity with AWS SDK types
type SQSClient interface {
	SendMessage(ctx context.Context, params *sqs.SendMessageInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageOutput, error)
	SendMessageBatch(ctx context.Context, params *sqs.SendMessageBatchInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageBatchOutput, error)
}

// Emitter publishes workflow events to AWS SQS
type Emitter struct {
	client   SQSClient
	queueURL string
	config   eventbus.PublisherConfig
	logger   *slog.Logger
}

// NewEmitter creates a new SQS emitter
func NewEmitter(client SQSClient, queueURL string, logger *slog.Logger) *Emitter {
	if logger == nil {
		logger = slog.Default()
	}

	return &Emitter{
		client:   client,
		queueURL: queueURL,
		config:   eventbus.DefaultConfig(),
		logger:   logger,
	}
}

// NewEmitterWithConfig creates a new SQS emitter with custom configuration
func NewEmitterWithConfig(client SQSClient, queueURL string, config eventbus.PublisherConfig, logger *slog.Logger) *Emitter {
	if logger == nil {
		logger = slog.Default()
	}

	return &Emitter{
		client:   client,
		queueURL: queueURL,
		config:   config,
		logger:   logger,
	}
}

// Emit publishes a workflow event to SQS
func (e *Emitter) Emit(ctx context.Context, event core.WorkflowEvent) error {
	e.logger.Debug("emitting event to SQS",
		"topic", event.Topic,
		"urn", event.URN,
		"queue", e.queueURL,
	)

	// Serialize the event
	body, err := eventbus.SerializeToString(event)
	if err != nil {
		return fmt.Errorf("failed to serialize event: %w", err)
	}

	// Build message attributes
	attributes := make(map[string]types.MessageAttributeValue)
	attributes["topic"] = types.MessageAttributeValue{
		DataType:    aws.String("String"),
		StringValue: aws.String(event.Topic),
	}
	attributes["urn"] = types.MessageAttributeValue{
		DataType:    aws.String("String"),
		StringValue: aws.String(event.URN),
	}
	if event.WorkflowName != "" {
		attributes["workflowName"] = types.MessageAttributeValue{
			DataType:    aws.String("String"),
			StringValue: aws.String(event.WorkflowName),
		}
	}

	// Send message to SQS
	input := &sqs.SendMessageInput{
		QueueUrl:          aws.String(e.queueURL),
		MessageBody:       aws.String(body),
		MessageAttributes: attributes,
	}

	output, err := e.client.SendMessage(ctx, input)
	if err != nil {
		e.logger.Error("failed to send message to SQS",
			"error", err,
			"topic", event.Topic,
			"urn", event.URN,
		)
		return fmt.Errorf("failed to send SQS message: %w", err)
	}

	e.logger.Info("event emitted to SQS",
		"messageId", *output.MessageId,
		"topic", event.Topic,
		"urn", event.URN,
	)

	return nil
}

// EmitBatch publishes multiple workflow events to SQS in a single batch
func (e *Emitter) EmitBatch(ctx context.Context, events []core.WorkflowEvent) error {
	if len(events) == 0 {
		return nil
	}

	if len(events) > 10 {
		return fmt.Errorf("SQS batch size cannot exceed 10 messages, got %d", len(events))
	}

	e.logger.Debug("emitting batch to SQS",
		"count", len(events),
		"queue", e.queueURL,
	)

	// Build batch entries
	entries := make([]types.SendMessageBatchRequestEntry, len(events))
	for i, event := range events {
		body, err := eventbus.SerializeToString(event)
		if err != nil {
			return fmt.Errorf("failed to serialize event %d: %w", i, err)
		}

		attributes := make(map[string]types.MessageAttributeValue)
		attributes["topic"] = types.MessageAttributeValue{
			DataType:    aws.String("String"),
			StringValue: aws.String(event.Topic),
		}
		attributes["urn"] = types.MessageAttributeValue{
			DataType:    aws.String("String"),
			StringValue: aws.String(event.URN),
		}
		if event.WorkflowName != "" {
			attributes["workflowName"] = types.MessageAttributeValue{
				DataType:    aws.String("String"),
				StringValue: aws.String(event.WorkflowName),
			}
		}

		entries[i] = types.SendMessageBatchRequestEntry{
			Id:                aws.String(fmt.Sprintf("msg-%d", i)),
			MessageBody:       aws.String(body),
			MessageAttributes: attributes,
		}
	}

	// Send batch to SQS
	input := &sqs.SendMessageBatchInput{
		QueueUrl: aws.String(e.queueURL),
		Entries:  entries,
	}

	output, err := e.client.SendMessageBatch(ctx, input)
	if err != nil {
		e.logger.Error("failed to send batch to SQS",
			"error", err,
			"count", len(events),
		)
		return fmt.Errorf("failed to send SQS batch: %w", err)
	}

	// Check for partial failures
	if len(output.Failed) > 0 {
		e.logger.Warn("partial batch failure",
			"successful", len(output.Successful),
			"failed", len(output.Failed),
		)

		// Log failed messages
		for _, failed := range output.Failed {
			e.logger.Error("message failed in batch",
				"id", *failed.Id,
				"code", *failed.Code,
				"message", *failed.Message,
			)
		}

		return fmt.Errorf("batch partially failed: %d/%d messages failed", len(output.Failed), len(events))
	}

	e.logger.Info("batch emitted to SQS",
		"successful", len(output.Successful),
		"queue", e.queueURL,
	)

	return nil
}
