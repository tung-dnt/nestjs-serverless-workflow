# Lambda Order State Machine Example

Complete AWS Lambda example demonstrating the `nestjs-serverless-workflow` library with Durable Lambda execution, DynamoDB, and AWS CDK deployment.

## Architecture

```
┌──────────────┐      ┌────────────────────────┐      ┌─────────────────┐
│  Event Source │─────▶│  Durable Lambda Worker │─────▶│ DynamoDB Table  │
│  (Invoke)     │      │  (withDurableExecution) │      │    (Orders)     │
└──────────────┘      └────────────────────────┘      └─────────────────┘
```

## Features

- **CDK Deployment**: Infrastructure as Code with AWS CDK
- **Durable Execution**: Uses `@aws/durable-execution-sdk-js` for reliable, resumable workflow execution
- **State Persistence**: DynamoDB for order storage
- **Auto-Scaling**: On-demand DynamoDB and concurrent Lambda execution
- **Monitoring**: CloudWatch logs with 90-day retention

## Installation

```bash
cd examples/lambda-order-state-machine
bun install
```

## Configuration

### Environment Variables

Create a `.env` file (optional for local development):

```env
AWS_REGION=us-east-1
DYNAMODB_TABLE=order-state-machine-orders-dev
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

## Running Locally

### Start the Application

```bash
bun run start
# or
bun run start:dev  # with hot reload
```

## Deployment

### Build TypeScript

```bash
bun run build
```

### Preview Changes

```bash
bun run diff
```

### Deploy to AWS

```bash
# Deploy to dev stage
bun run deploy:dev

# Deploy to prod stage
bun run deploy:prod

# Or specify stage via CDK context
bunx cdk deploy -c stage=prod -c region=us-west-2
```

### Deployment Output

After deployment, you'll see CDK outputs:

```
Outputs:
order-state-machine-dev.FunctionAliasArn = arn:aws:lambda:us-east-1:123456789:function:order-state-machine-dev-order-workflow:live
order-state-machine-dev.TableName = order-state-machine-orders-dev
```

## Monitoring

### View Logs

```bash
aws logs tail /aws/lambda/order-state-machine-dev-order-workflow --follow
```

### CloudWatch Metrics

Monitor in AWS Console:
- Lambda Invocations and Duration
- DynamoDB Read/Write Capacity
- Durable Execution metrics
- Error Rates

## Testing

### Invoke Lambda via AWS CLI

Use the alias ARN from the deployment output (durable functions must be invoked via qualified ARN):

```bash
aws lambda invoke \
  --function-name arn:aws:lambda:us-east-1:YOUR_ACCOUNT:function:order-state-machine-dev-order-workflow:live \
  --payload '{"urn":"order-123","event":"order.submit","payload":{"items":["item1"],"totalAmount":100}}' \
  output.json
```

## Workflow States

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

## Project Structure

```
lambda-order-state-machine/
├── src/
│   ├── dynamodb/
│   │   ├── client.ts                 # DynamoDB client
│   │   └── order.table.ts            # Order table definition
│   ├── order/
│   │   ├── order.constant.ts         # Constants and enums
│   │   ├── order.module.ts           # NestJS module
│   │   ├── order.workflow.ts         # Workflow definition
│   │   └── order-entity.service.ts   # Entity service
│   ├── lambda.ts                     # Durable Lambda handler
│   └── main.ts                       # Local entry point
├── infra/
│   └── order-stack.ts                # CDK stack definition
├── dist/                             # Compiled JavaScript
├── cdk.json                          # CDK app config
├── package.json
├── tsconfig.json
└── README.md
```

## Stack Details

### AWS Resources Created

1. **Lambda Function (Durable)**
   - Runtime: Node.js 22.x
   - Memory: 512 MB
   - Timeout: 15 minutes
   - Durable execution timeout: 1 hour
   - Checkpoint retention: 30 days
   - Wrapped with `withDurableExecution` for automatic replay and fault tolerance

2. **DynamoDB Table**
   - Billing: On-demand (PAY_PER_REQUEST)
   - Partition key: `id` (string)

3. **Durable Execution Store**
   - Managed by `@aws/durable-execution-sdk-js`
   - Stores execution history for replay on Lambda restarts

### IAM Permissions

The Lambda function has permissions for:
- DynamoDB: Full read/write access to the orders table
- Durable execution: `AWSLambdaBasicDurableExecutionRolePolicy`

## Cost Estimation

**Development (dev stage)**:
- Lambda: ~$0.01 - $1.00/month (depending on usage)
- DynamoDB: Free tier (25 GB storage, 25 RCU/WCU)

**Production (prod stage)**:
- Scales with usage, typically $10-100/month for moderate traffic

## Advanced Features

### Durable Execution

The Lambda handler is wrapped with `withDurableExecution`, which provides:
- **Automatic Replay**: If the Lambda is interrupted, execution resumes from the last checkpoint
- **Fault Tolerance**: Transient failures are handled transparently
- **Deterministic Execution**: Side effects are recorded and replayed consistently

### Lambda Handler

```typescript
import { withDurableExecution } from "@aws/durable-execution-sdk-js";
import { NestFactory } from "@nestjs/core";
import { DurableLambdaEventHandler } from "nestjs-serverless-workflow/adapter";
import { OrderModule } from "./order/order.module";

const app = await NestFactory.createApplicationContext(OrderModule);
await app.init();

export const handler = DurableLambdaEventHandler(app, withDurableExecution);
```

### Module Registration

```typescript
WorkflowModule.register({
  entities: [{ provide: ORDER_WORKFLOW_ENTITY, useClass: OrderEntityService }],
  workflows: [OrderWorkflow],
})
```

## Troubleshooting

### Deployment Issues

**Issue**: `The security token included in the request is invalid`
**Solution**: Check AWS credentials with `aws sts get-caller-identity`

**Issue**: `CDKToolkit stack not found`
**Solution**: Bootstrap CDK with `bunx cdk bootstrap`

### Runtime Issues

**Issue**: Lambda timeout
**Solution**: Check workflow logic for long-running operations

**Issue**: Workflow not progressing
**Solution**:
1. Check Lambda CloudWatch logs
2. Verify IAM permissions
3. Check DynamoDB table exists
4. Verify durable execution store is accessible

## Cleanup

Remove all AWS resources:

```bash
bun run destroy
```

This will delete:
- Lambda function
- DynamoDB table
- IAM roles
- CloudWatch log groups

## Learn More

- [nestjs-serverless-workflow Documentation](../../docs/)
- [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/v2/guide/)
- [AWS Lambda Durable Execution](https://docs.aws.amazon.com/lambda/latest/dg/durable-getting-started-iac.html)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [AWS Durable Execution SDK](https://github.com/aws/durable-execution-sdk-js)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

## License

MIT
