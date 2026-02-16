
# Order Workflow Example

Complete example of a serverless order processing workflow using the Go Workflow Engine on AWS Lambda.

## Architecture

```
┌─────────────┐
│  SQS Event  │
│ order.created│
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│  Lambda: OrderWorkflowFunction  │
│  ┌──────────────────────────┐   │
│  │  Orchestrator            │   │
│  │  ├─ Load Entity (DynamoDB)│   │
│  │  ├─ Validate Transition  │   │
│  │  ├─ Execute Handler      │   │
│  │  ├─ Update State         │   │
│  │  └─ Auto-transition?     │   │
│  └──────────────────────────┘   │
└─────────────┬───────────────────┘
              │
       ┌──────┴──────┐
       ▼             ▼
  ┌────────┐    ┌────────┐
  │DynamoDB│    │  SQS   │
  │ Orders │    │ Events │
  └────────┘    └────────┘
```

## Workflow States

```
pending ──order.created──▶ processing ──order.processing──▶ shipped (FINAL)
   │
   └──────order.cancelled──────────────────────────────────▶ cancelled (FINAL)

                      Any error ──▶ failed (FAILED)
```

## Features Demonstrated

- ✅ **Event-driven workflow** - SQS triggers Lambda
- ✅ **Automatic state transitions** - Processing → Shipped
- ✅ **Conditional routing** - Auto-approve orders < $100
- ✅ **Error handling** - Retryable vs unretriable errors
- ✅ **Lambda timeout management** - 5-second safety window
- ✅ **Batch processing** - Process up to 10 messages concurrently
- ✅ **DynamoDB integration** - Entity persistence
- ✅ **CloudWatch monitoring** - Structured logging and alarms

## Prerequisites

- Go 1.21 or later
- AWS SAM CLI
- AWS Account with credentials configured
- Docker (for local testing with SAM)

## Quick Start

### 1. Build

```bash
cd examples/order-workflow
GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap main.go
```

### 2. Deploy

```bash
sam deploy --guided
```

Follow the prompts:
- Stack Name: `order-workflow-dev`
- AWS Region: `us-east-1`
- Confirm changes: `Y`
- Allow SAM CLI IAM role creation: `Y`
- Disable rollback: `N`
- Save arguments to samconfig.toml: `Y`

### 3. Test

Send a test event to the SQS queue:

```bash
# Get queue URL from CloudFormation outputs
QUEUE_URL=$(aws cloudformation describe-stacks \
  --stack-name order-workflow-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`WorkflowQueueURL`].OutputValue' \
  --output text)

# Send order.created event
aws sqs send-message \
  --queue-url $QUEUE_URL \
  --message-body '{
    "topic": "order.created",
    "urn": "order:12345",
    "payload": {
      "totalAmount": 59.99
    }
  }'
```

### 4. Monitor

Watch the logs:

```bash
sam logs -n OrderWorkflowFunction --stack-name order-workflow-dev --tail
```

Expected output:

```json
{
  "time": "2026-02-16T10:00:00Z",
  "level": "INFO",
  "msg": "processing SQS event batch",
  "recordCount": 1
}
{
  "time": "2026-02-16T10:00:00Z",
  "level": "INFO",
  "msg": "handling order created",
  "orderId": "12345",
  "totalAmount": 59.99
}
{
  "time": "2026-02-16T10:00:00Z",
  "level": "INFO",
  "msg": "order approved, starting processing",
  "orderId": "12345"
}
{
  "time": "2026-02-16T10:00:00Z",
  "level": "INFO",
  "msg": "processing order",
  "orderId": "12345",
  "itemCount": 1
}
{
  "time": "2026-02-16T10:00:00Z",
  "level": "INFO",
  "msg": "order shipped",
  "orderId": "12345",
  "shipmentId": "SHIP-12345"
}
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ORDERS_TABLE_NAME` | DynamoDB table for orders | `orders` |
| `WORKFLOW_QUEUE_URL` | SQS queue for workflow events | (required) |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |

### Lambda Settings

- **Timeout**: 30 seconds
- **Memory**: 128 MB (adjust based on load)
- **Runtime**: Amazon Linux 2023 (provided.al2023)
- **Architecture**: ARM64 (Graviton2 - better price/performance)

### SQS Settings

- **Batch Size**: 10 messages
- **Visibility Timeout**: 180 seconds (3x Lambda timeout)
- **Max Receive Count**: 3 (then send to DLQ)
- **Batching Window**: 5 seconds

## Local Development

### Run Locally with SAM

```bash
# Start local Lambda and DynamoDB
sam local start-lambda --docker-network sam-local

# In another terminal, invoke the function
sam local invoke OrderWorkflowFunction \
  --event test-event.json
```

### Test Event (test-event.json)

```json
{
  "Records": [
    {
      "messageId": "test-message-1",
      "body": "{\"topic\":\"order.created\",\"urn\":\"order:12345\",\"payload\":{\"totalAmount\":59.99}}"
    }
  ]
}
```

## Testing

### Unit Tests

```bash
go test ./... -v -cover
```

### Integration Tests

```bash
# Requires LocalStack
docker run -d -p 4566:4566 localstack/localstack

go test ./... -tags=integration
```

## Cost Estimation

For 1 million orders/month:

| Service | Usage | Cost |
|---------|-------|------|
| Lambda | 1M invocations @ 128MB, 0.5s avg | $0.20 |
| SQS | 1M requests | $0.40 |
| DynamoDB | 1M writes, 100KB avg | $1.25 |
| CloudWatch Logs | 1GB | $0.50 |
| **Total** | | **~$2.35/month** |

## Performance

### Expected Metrics

- **Cold Start**: ~100-200ms (Go binary)
- **Warm Execution**: ~10-50ms per order
- **Throughput**: ~2000 orders/second per Lambda
- **Memory**: 64-128MB typical

### Optimization Tips

1. **Increase batch size** - Process more messages per invocation
2. **Tune memory** - More memory = faster CPU (up to 1.8GB)
3. **Use ARM64** - 20% better price/performance vs x86
4. **Enable provisioned concurrency** - Eliminate cold starts for critical flows

## Monitoring

### CloudWatch Metrics

- `Errors` - Lambda execution errors
- `Duration` - Execution time
- `ConcurrentExecutions` - Active Lambda instances
- `ApproximateAgeOfOldestMessage` - SQS backlog

### Alarms

1. **Workflow Errors** - Triggers when >5 errors in 5 minutes
2. **DLQ Messages** - Triggers when any message enters DLQ

### Dashboards

```bash
# View Lambda metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=order-workflow-dev-order-workflow \
  --statistics Average \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300
```

## Troubleshooting

### Messages stuck in DLQ

Check logs for errors:

```bash
sam logs -n OrderWorkflowFunction --stack-name order-workflow-dev --filter "ERROR"
```

Common issues:
- Invalid JSON in message body
- Entity not found in DynamoDB
- Unretriable business logic errors

### Lambda timeouts

Increase timeout or reduce batch size:

```yaml
# template.yaml
Globals:
  Function:
    Timeout: 60  # Increase to 60 seconds
```

Then redeploy:

```bash
sam deploy
```

### High costs

1. Check CloudWatch Logs retention (default: 7 days)
2. Review DynamoDB capacity mode (on-demand vs provisioned)
3. Monitor SQS message size (optimize payload)

## Cleanup

Delete the stack:

```bash
sam delete --stack-name order-workflow-dev
```

This removes:
- Lambda function
- SQS queues (including DLQ)
- DynamoDB table
- CloudWatch Log Group
- IAM roles

## Next Steps

- [ ] Add SAGA pattern for distributed transactions
- [ ] Implement retry strategies with exponential backoff
- [ ] Add API Gateway for HTTP event triggers
- [ ] Integrate with EventBridge for complex event routing
- [ ] Add workflow visualization dashboard
- [ ] Implement workflow versioning

## License

MIT
