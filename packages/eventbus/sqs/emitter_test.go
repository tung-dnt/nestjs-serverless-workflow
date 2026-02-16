//nolint:revive // Test file with mock implementations that intentionally have unused parameters
package sqs

import (
	"context"
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/tung-dnt/nestjs-serverless-workflow/packages/core"
)

// MockSQSClient for testing
type MockSQSClient struct {
	sendMessageFunc      func(ctx context.Context, params *sqs.SendMessageInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageOutput, error)
	sendMessageBatchFunc func(ctx context.Context, params *sqs.SendMessageBatchInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageBatchOutput, error)
}

func (m *MockSQSClient) SendMessage(ctx context.Context, params *sqs.SendMessageInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageOutput, error) {
	if m.sendMessageFunc != nil {
		return m.sendMessageFunc(ctx, params, optFns...)
	}
	return &sqs.SendMessageOutput{
		MessageId: aws.String("test-message-id"),
	}, nil
}

func (m *MockSQSClient) SendMessageBatch(ctx context.Context, params *sqs.SendMessageBatchInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageBatchOutput, error) {
	if m.sendMessageBatchFunc != nil {
		return m.sendMessageBatchFunc(ctx, params, optFns...)
	}

	successful := make([]types.SendMessageBatchResultEntry, len(params.Entries))
	for i, entry := range params.Entries {
		successful[i] = types.SendMessageBatchResultEntry{
			Id:               entry.Id,
			MessageId:        aws.String("test-message-id-" + *entry.Id),
			MD5OfMessageBody: aws.String("test-md5"),
		}
	}

	return &sqs.SendMessageBatchOutput{
		Successful: successful,
		Failed:     []types.BatchResultErrorEntry{},
	}, nil
}

func TestEmitter_Emit(t *testing.T) {
	tests := []struct {
		name    string
		event   core.WorkflowEvent
		mockFn  func(ctx context.Context, params *sqs.SendMessageInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageOutput, error)
		wantErr bool
	}{
		{
			name: "successful emit",
			event: core.WorkflowEvent{
				Topic:   "order.created",
				URN:     "order:123",
				Payload: map[string]any{"test": "data"},
			},
			mockFn: func(ctx context.Context, params *sqs.SendMessageInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageOutput, error) {
				// Verify message attributes
				if params.MessageAttributes["topic"].StringValue == nil || *params.MessageAttributes["topic"].StringValue != "order.created" {
					t.Error("expected topic attribute to be 'order.created'")
				}
				if params.MessageAttributes["urn"].StringValue == nil || *params.MessageAttributes["urn"].StringValue != "order:123" {
					t.Error("expected urn attribute to be 'order:123'")
				}

				return &sqs.SendMessageOutput{
					MessageId: aws.String("test-message-id"),
				}, nil
			},
			wantErr: false,
		},
		{
			name: "SQS error",
			event: core.WorkflowEvent{
				Topic:   "order.created",
				URN:     "order:123",
				Payload: map[string]any{"test": "data"},
			},
			mockFn: func(ctx context.Context, params *sqs.SendMessageInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageOutput, error) {
				return nil, errors.New("SQS error")
			},
			wantErr: true,
		},
		{
			name: "event with workflow name",
			event: core.WorkflowEvent{
				Topic:        "order.created",
				URN:          "order:123",
				WorkflowName: "OrderWorkflow",
				Payload:      map[string]any{"test": "data"},
			},
			mockFn: func(ctx context.Context, params *sqs.SendMessageInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageOutput, error) {
				if params.MessageAttributes["workflowName"].StringValue == nil || *params.MessageAttributes["workflowName"].StringValue != "OrderWorkflow" {
					t.Error("expected workflowName attribute")
				}
				return &sqs.SendMessageOutput{
					MessageId: aws.String("test-message-id"),
				}, nil
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockClient := &MockSQSClient{
				sendMessageFunc: tt.mockFn,
			}

			emitter := NewEmitter(mockClient, "https://sqs.us-east-1.amazonaws.com/123456789/test-queue", nil)
			err := emitter.Emit(context.Background(), tt.event)

			if (err != nil) != tt.wantErr {
				t.Errorf("Emit() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestEmitter_EmitBatch(t *testing.T) {
	tests := []struct {
		name    string
		events  []core.WorkflowEvent
		mockFn  func(ctx context.Context, params *sqs.SendMessageBatchInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageBatchOutput, error)
		wantErr bool
	}{
		{
			name: "successful batch",
			events: []core.WorkflowEvent{
				{Topic: "order.created", URN: "order:1", Payload: map[string]any{}},
				{Topic: "order.created", URN: "order:2", Payload: map[string]any{}},
			},
			mockFn: func(ctx context.Context, params *sqs.SendMessageBatchInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageBatchOutput, error) {
				if len(params.Entries) != 2 {
					t.Errorf("expected 2 entries, got %d", len(params.Entries))
				}

				successful := make([]types.SendMessageBatchResultEntry, len(params.Entries))
				for i, entry := range params.Entries {
					successful[i] = types.SendMessageBatchResultEntry{
						Id:        entry.Id,
						MessageId: aws.String("msg-" + *entry.Id),
					}
				}

				return &sqs.SendMessageBatchOutput{
					Successful: successful,
					Failed:     []types.BatchResultErrorEntry{},
				}, nil
			},
			wantErr: false,
		},
		{
			name:    "empty batch",
			events:  []core.WorkflowEvent{},
			wantErr: false,
		},
		{
			name:    "batch too large",
			events:  make([]core.WorkflowEvent, 11), // SQS max is 10
			wantErr: true,
		},
		{
			name: "partial batch failure",
			events: []core.WorkflowEvent{
				{Topic: "order.created", URN: "order:1", Payload: map[string]any{}},
				{Topic: "order.created", URN: "order:2", Payload: map[string]any{}},
			},
			mockFn: func(ctx context.Context, params *sqs.SendMessageBatchInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageBatchOutput, error) {
				return &sqs.SendMessageBatchOutput{
					Successful: []types.SendMessageBatchResultEntry{
						{
							Id:        aws.String("msg-0"),
							MessageId: aws.String("test-id-0"),
						},
					},
					Failed: []types.BatchResultErrorEntry{
						{
							Id:      aws.String("msg-1"),
							Code:    aws.String("InternalError"),
							Message: aws.String("Failed to process"),
						},
					},
				}, nil
			},
			wantErr: true,
		},
		{
			name: "complete batch failure",
			events: []core.WorkflowEvent{
				{Topic: "order.created", URN: "order:1", Payload: map[string]any{}},
			},
			mockFn: func(ctx context.Context, params *sqs.SendMessageBatchInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageBatchOutput, error) {
				return nil, errors.New("SQS error")
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockClient := &MockSQSClient{
				sendMessageBatchFunc: tt.mockFn,
			}

			emitter := NewEmitter(mockClient, "https://sqs.us-east-1.amazonaws.com/123456789/test-queue", nil)
			err := emitter.EmitBatch(context.Background(), tt.events)

			if (err != nil) != tt.wantErr {
				t.Errorf("EmitBatch() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
