# Lambda Order State Machine Example

Complete AWS Lambda example demonstrating the `nestjs-serverless-workflow` library with SQS, DynamoDB, and serverless deployment.

## 🏗️ Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────────┐
│  SQS Queue  │─────▶│ Lambda Worker│─────▶│ DynamoDB Table │
│   (FIFO)    │      │  (Workflow)  │      │    (Orders)     │
└─────────────┘      └──────────────┘      └─────────────────┘
       │                     │
       │                     ▼
       │            ┌──────────────┐
       └───────────▶│  DLQ (FIFO)  │
                    └──────────────┘
```

## 🚀 Features

- **Serverless Deployment**: Fully configured AWS Lambda with Serverless Framework
- **Event-Driven**: SQS FIFO queue for reliable message processing
- **State Persistence**: DynamoDB for order storage
- **Error Handling**: Dead Letter Queue (DLQ) for failed messages
- **Auto-Scaling**: On-demand DynamoDB and concurrent Lambda execution
- **Monitoring**: CloudWatch logs with 90-day retention
- **Batch Processing**: Process up to 10 messages per Lambda invocation

## 📦 Installation

```bash
cd examples/lambda-order-state-machine
bun install
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file (optional for local development):

```env
AWS_REGION=us-east-1
STAGE=dev
DYNAMODB_TABLE=lambda-order-state-machine-orders-dev
```

### AWS Credentials

Ensure AWS credentials are configured:

```bash
aws configure
```

Or set environment variables:

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=us-east-1
```

## 🏃 Running Locally

### Start the HTTP Server

```bash
bun run local
# or
bun run dev  # with hot reload
```

The server will start on `http://localhost:3000`

### Test Endpoints

```bash
# Create an order (triggers workflow)
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "items": ["item1", "item2"],
    "totalAmount": 150.00
  }'

# Get order status
curl http://localhost:3000/orders/{orderId}
```

## 🚢 Deployment

### Build TypeScript

```bash
bun run build
```

### Deploy to AWS

```bash
# Deploy to dev stage
bun run deploy:dev

# Deploy to prod stage
bun run deploy:prod

# Or specify region and stage
serverless deploy --stage prod --region us-west-2
```

### Deployment Output

After deployment, you'll see:

```
Service Information
service: lambda-order-state-machine
stage: dev
region: us-east-1
stack: lambda-order-state-machine-dev
resources: 12

functions:
  order-queue-worker: lambda-order-state-machine-dev-order-queue-worker

Outputs:
  OrdersTableName: lambda-order-state-machine-orders-dev
  OrderQueueUrl: https://sqs.us-east-1.amazonaws.com/.../lambda-order-state-machine-orders-dev.fifo
```

## 📊 Monitoring

### View Logs

```bash
# Tail logs in real-time
bun run logs

# Or with serverless directly
serverless logs -f order-queue-worker -t --stage dev
```

### CloudWatch Metrics

Monitor in AWS Console:
- Lambda Invocations
- SQS Messages (Sent, Received, Deleted)
- DynamoDB Read/Write Capacity
- Error Rates

## 🧪 Testing

### Send Test Message to SQS

```bash
aws sqs send-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/.../lambda-order-state-machine-orders-dev.fifo \
  --message-body '{"urn":"order-123","event":"order.submit","payload":{"items":["item1"],"totalAmount":100}}' \
  --message-group-id "order-123" \
  --message-deduplication-id "$(uuidgen)"
```

### Invoke Lambda Directly

```bash
serverless invoke -f order-queue-worker \
  --data '{"Records":[{"body":"{\"urn\":\"order-123\",\"event\":\"order.submit\"}"}]}'
```

## 🔄 Workflow States

The order workflow transitions through these states:

```
PENDING → PROCESSING → COMPLETED
   │
   └──▶ CANCELLED
   │
   └──▶ FAILED
```

### State Transitions

1. **PENDING**: Order created
2. **PROCESSING**: Order being processed (triggered by `order.submit`)
3. **COMPLETED**: Order successfully completed (triggered by `order.complete`)
4. **CANCELLED**: Order cancelled (manual)
5. **FAILED**: Order failed (on error)

## 📁 Project Structure

```
lambda-order-state-machine/
├── src/
│   ├── broker/
│   │   └── mock-broker.service.ts    # SQS mock publisher
│   ├── dynamodb/
│   │   ├── client.ts                 # DynamoDB client
│   │   └── order.table.ts            # Order table definition
│   ├── order/
│   │   ├── order.constant.ts         # Constants and enums
│   │   ├── order.controller.ts       # HTTP endpoints
│   │   ├── order.module.ts           # NestJS module
│   │   ├── order.workflow.ts         # Workflow definition
│   │   └── order-entity.service.ts   # Entity service
│   ├── lambda.ts                     # Lambda handler
│   └── main.ts                       # HTTP server entry
├── dist/                             # Compiled JavaScript
├── package.json
├── serverless.yml                    # Serverless config
├── tsconfig.json
└── README.md
```

## 🛠️ Stack Details

### AWS Resources Created

1. **Lambda Function**
   - Runtime: Node.js 20.x
   - Memory: 1024 MB
   - Timeout: 15 minutes
   - Concurrency: 5 (reserved)

2. **SQS Queue (FIFO)**
   - Message retention: 14 days
   - Visibility timeout: 15 minutes
   - Max retries: 3
   - DLQ enabled

3. **DynamoDB Table**
   - Billing: On-demand
   - Point-in-time recovery: Enabled
   - Stream: Enabled (NEW_AND_OLD_IMAGES)
   - GSI: status-index

4. **Dead Letter Queue (FIFO)**
   - Message retention: 14 days
   - For failed messages after 3 retries

### IAM Permissions

The Lambda function has permissions for:
- DynamoDB: GetItem, PutItem, UpdateItem, Query, Scan
- SQS: SendMessage, ReceiveMessage, DeleteMessage, GetQueueAttributes

## 💰 Cost Estimation

**Development (dev stage)**:
- Lambda: ~$0.01 - $1.00/month (depending on usage)
- DynamoDB: Free tier (25 GB storage, 25 RCU/WCU)
- SQS: Free tier (1M requests)

**Production (prod stage)**:
- Scales with usage, typically $10-100/month for moderate traffic

## 🔥 Advanced Features

### Retry Logic

Failed messages are automatically retried up to 3 times with exponential backoff before moving to DLQ.

### Batch Processing

Lambda processes up to 10 messages per invocation for efficiency.

### Partial Batch Failures

Uses `ReportBatchItemFailures` to only retry failed messages in a batch.

### Auto-Timeout Handling

Lambda adapter gracefully stops processing 5 seconds before timeout to avoid message duplication.

## 🐛 Troubleshooting

### Deployment Issues

**Issue**: `An error occurred: OrderQueue - A queue already exists with the same name`
**Solution**: Delete the existing queue or change the service name in `serverless.yml`

**Issue**: `The security token included in the request is invalid`
**Solution**: Check AWS credentials with `aws sts get-caller-identity`

### Runtime Issues

**Issue**: Messages stuck in DLQ
**Solution**: Check CloudWatch logs for errors, fix issues, then replay messages

**Issue**: Lambda timeout
**Solution**: Increase timeout in `serverless.yml` or optimize workflow logic

### Message Not Processing

1. Check SQS queue has messages
2. Check Lambda CloudWatch logs
3. Verify IAM permissions
4. Check DynamoDB table exists

## 🧹 Cleanup

Remove all AWS resources:

```bash
serverless remove --stage dev
```

This will delete:
- Lambda function
- SQS queues (main + DLQ)
- DynamoDB table
- IAM roles
- CloudWatch log groups

## 📚 Learn More

- [nestjs-serverless-workflow Documentation](../../docs/)
- [Serverless Framework Docs](https://www.serverless.com/framework/docs)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [SQS FIFO Queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

## 📝 License

MIT
