package lambda

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/tung-dnt/nestjs-serverless-workflow/packages/core"
	"github.com/tung-dnt/nestjs-serverless-workflow/packages/eventbus"
)

// Handler processes SQS events in AWS Lambda with timeout management
type Handler struct {
	orchestrator *core.Orchestrator
	logger       *slog.Logger

	// SafetyWindowSeconds is the time reserved before Lambda timeout to gracefully shutdown
	SafetyWindowSeconds int

	// MaxConcurrency limits the number of concurrent message processors
	MaxConcurrency int
}

// NewHandler creates a new Lambda handler
func NewHandler(orchestrator *core.Orchestrator, logger *slog.Logger) *Handler {
	if logger == nil {
		logger = slog.Default()
	}

	return &Handler{
		orchestrator:        orchestrator,
		logger:              logger,
		SafetyWindowSeconds: 5,  // Reserve 5 seconds before timeout
		MaxConcurrency:      10, // Process up to 10 messages concurrently
	}
}

// HandlerConfig holds configuration for the Lambda handler
type HandlerConfig struct {
	SafetyWindowSeconds int
	MaxConcurrency      int
}

// NewHandlerWithConfig creates a new Lambda handler with custom configuration
func NewHandlerWithConfig(orchestrator *core.Orchestrator, config HandlerConfig, logger *slog.Logger) *Handler {
	if logger == nil {
		logger = slog.Default()
	}

	return &Handler{
		orchestrator:        orchestrator,
		logger:              logger,
		SafetyWindowSeconds: config.SafetyWindowSeconds,
		MaxConcurrency:      config.MaxConcurrency,
	}
}

// HandleSQSEvent processes SQS events from Lambda
func (h *Handler) HandleSQSEvent(ctx context.Context, sqsEvent events.SQSEvent) (events.SQSEventResponse, error) {
	h.logger.Info("processing SQS event batch",
		"recordCount", len(sqsEvent.Records),
	)

	// Calculate safe deadline (Lambda timeout - safety window)
	safeCtx, cancel := h.createSafeContext(ctx)
	defer cancel()

	// Track batch item failures for partial batch response
	var (
		mu       sync.Mutex
		failures []events.SQSBatchItemFailure
		wg       sync.WaitGroup
	)

	// Semaphore for concurrency control
	sem := make(chan struct{}, h.MaxConcurrency)

	// Process records concurrently
	for _, record := range sqsEvent.Records {
		wg.Add(1)

		go func(rec events.SQSMessage) {
			defer wg.Done()

			// Acquire semaphore
			sem <- struct{}{}
			defer func() { <-sem }()

			// Process the message
			if err := h.processMessage(safeCtx, rec); err != nil {
				h.logger.Error("failed to process message",
					"messageId", rec.MessageId,
					"error", err,
				)

				// Add to batch item failures
				mu.Lock()
				failures = append(failures, events.SQSBatchItemFailure{
					ItemIdentifier: rec.MessageId,
				})
				mu.Unlock()
			}
		}(record)
	}

	// Wait for all messages to be processed or context deadline
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		h.logger.Info("all messages processed",
			"total", len(sqsEvent.Records),
			"failed", len(failures),
		)
	case <-safeCtx.Done():
		h.logger.Warn("context deadline exceeded, stopping message processing",
			"processed", len(sqsEvent.Records)-len(failures),
			"remaining", len(failures),
		)
	}

	// Return batch item failures for SQS to retry
	return events.SQSEventResponse{
		BatchItemFailures: failures,
	}, nil
}

// processMessage handles a single SQS message
func (h *Handler) processMessage(ctx context.Context, message events.SQSMessage) error {
	h.logger.Debug("processing message",
		"messageId", message.MessageId,
		"body", message.Body,
	)

	// Deserialize workflow event from message body
	event, err := eventbus.DeserializeFromString(message.Body)
	if err != nil {
		h.logger.Error("failed to deserialize message",
			"messageId", message.MessageId,
			"error", err,
		)
		// Return error to mark as failed
		return err
	}

	// Process the workflow event
	if err := h.orchestrator.Transit(ctx, event); err != nil {
		// Check if error is unretriable
		if core.IsUnretriable(err) {
			h.logger.Error("unretriable error, message will not be retried",
				"messageId", message.MessageId,
				"topic", event.Topic,
				"urn", event.URN,
				"error", err,
			)
			// Don't return error - this removes message from queue
			return nil
		}

		h.logger.Error("workflow execution failed, message will be retried",
			"messageId", message.MessageId,
			"topic", event.Topic,
			"urn", event.URN,
			"error", err,
		)
		return err
	}

	h.logger.Debug("message processed successfully",
		"messageId", message.MessageId,
		"topic", event.Topic,
		"urn", event.URN,
	)

	return nil
}

// createSafeContext creates a context with deadline set to Lambda timeout minus safety window
func (h *Handler) createSafeContext(ctx context.Context) (context.Context, context.CancelFunc) {
	// Check if context has a deadline (Lambda sets this automatically)
	deadline, ok := ctx.Deadline()
	if !ok {
		// Not running in Lambda or no deadline set, use default timeout
		h.logger.Warn("no deadline in context, using default 5-minute timeout")
		return context.WithTimeout(ctx, 5*time.Minute)
	}

	// Calculate safe deadline
	safetyWindow := time.Duration(h.SafetyWindowSeconds) * time.Second
	safeDeadline := deadline.Add(-safetyWindow)

	// Check if we have enough time
	remainingTime := time.Until(safeDeadline)
	if remainingTime <= 0 {
		h.logger.Warn("insufficient time remaining before Lambda timeout",
			"deadline", deadline,
			"safetyWindow", safetyWindow,
		)
		// Return immediately expiring context
		return context.WithDeadline(ctx, time.Now())
	}

	h.logger.Debug("created safe context",
		"lambdaDeadline", deadline,
		"safeDeadline", safeDeadline,
		"remainingTime", remainingTime,
	)

	return context.WithDeadline(ctx, safeDeadline)
}

// HandleSQSEventAsync is an alternative handler that processes messages without waiting
// This is useful for very high-throughput scenarios where you want to return quickly
func (h *Handler) HandleSQSEventAsync(ctx context.Context, sqsEvent events.SQSEvent) (events.SQSEventResponse, error) {
	h.logger.Info("processing SQS event batch asynchronously",
		"recordCount", len(sqsEvent.Records),
	)

	// Create safe context
	safeCtx, cancel := h.createSafeContext(ctx)
	defer cancel()

	var failures []events.SQSBatchItemFailure

	// Process each message sequentially (async processing happens in orchestrator)
	for _, record := range sqsEvent.Records {
		select {
		case <-safeCtx.Done():
			h.logger.Warn("context deadline exceeded, marking remaining messages as failed",
				"messageId", record.MessageId,
			)
			failures = append(failures, events.SQSBatchItemFailure{
				ItemIdentifier: record.MessageId,
			})
			continue
		default:
		}

		if err := h.processMessage(safeCtx, record); err != nil {
			failures = append(failures, events.SQSBatchItemFailure{
				ItemIdentifier: record.MessageId,
			})
		}
	}

	return events.SQSEventResponse{
		BatchItemFailures: failures,
	}, nil
}
