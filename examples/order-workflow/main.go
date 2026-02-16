package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	lambdaadapter "github.com/tung-dnt/nestjs-serverless-workflow/packages/adapter/lambda"
	"github.com/tung-dnt/nestjs-serverless-workflow/packages/core"
	sqsemitter "github.com/tung-dnt/nestjs-serverless-workflow/packages/eventbus/sqs"
)

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

	// Create workflow
	orderWorkflow := NewOrderWorkflow(
		NewOrderEntityService(dynamoClient, tableName, logger),
		sqsemitter.NewEmitter(sqsClient, queueURL, logger),
		logger,
	)

	// Setup orchestrator
	orchestrator := core.NewOrchestrator(logger)
	orchestrator.Register(orderWorkflow.Definition().AsInterface())

	// Create Lambda handler
	handler := lambdaadapter.NewHandler(orchestrator, logger)

	// Start Lambda
	logger.Info("starting order workflow Lambda handler")
	lambda.Start(handler.HandleSQSEvent)
}
