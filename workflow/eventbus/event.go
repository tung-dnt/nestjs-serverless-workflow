package eventbus

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/tung-dnt/nestjs-serverless-workflow/workflow/core"
)

// EventMetadata contains metadata for workflow events
type EventMetadata struct {
	// Timestamp when the event was created
	Timestamp time.Time `json:"timestamp"`

	// Source identifies the origin of the event
	Source string `json:"source,omitempty"`

	// CorrelationID for tracing related events
	CorrelationID string `json:"correlationId,omitempty"`

	// RetryCount tracks retry attempts
	RetryCount int `json:"retryCount,omitempty"`

	// Custom metadata fields
	Custom map[string]string `json:"custom,omitempty"`
}

// EnrichedWorkflowEvent extends core.WorkflowEvent with metadata
type EnrichedWorkflowEvent struct {
	core.WorkflowEvent
	Metadata EventMetadata `json:"metadata"`
}

// NewEnrichedEvent creates an enriched workflow event with default metadata
func NewEnrichedEvent(event core.WorkflowEvent) EnrichedWorkflowEvent {
	return EnrichedWorkflowEvent{
		WorkflowEvent: event,
		Metadata: EventMetadata{
			Timestamp: time.Now(),
			Custom:    make(map[string]string),
		},
	}
}

// Serialize converts a workflow event to JSON bytes
func Serialize(event core.WorkflowEvent) ([]byte, error) {
	enriched := NewEnrichedEvent(event)
	return json.Marshal(enriched)
}

// Deserialize converts JSON bytes to a workflow event
func Deserialize(data []byte) (core.WorkflowEvent, error) {
	var enriched EnrichedWorkflowEvent
	if err := json.Unmarshal(data, &enriched); err != nil {
		return core.WorkflowEvent{}, fmt.Errorf("failed to deserialize event: %w", err)
	}
	return enriched.WorkflowEvent, nil
}

// SerializeToString converts a workflow event to a JSON string
func SerializeToString(event core.WorkflowEvent) (string, error) {
	data, err := Serialize(event)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// DeserializeFromString converts a JSON string to a workflow event
func DeserializeFromString(data string) (core.WorkflowEvent, error) {
	return Deserialize([]byte(data))
}
