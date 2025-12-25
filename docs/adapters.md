# Adapters

Adapters help integrate the workflow engine with different runtime environments.

## Installation

```typescript
import { LambdaEventHandler } from 'serverless-workflow/adapter';
```

## Lambda Adapter

The Lambda adapter enables running workflows in AWS Lambda with SQS event sources.

### Setup

1. Install AWS Lambda types:

```bash
npm install -D @types/aws-lambda
```

2. Create a Lambda handler:

```typescript
import { NestFactory } from '@nestjs/core';
import { LambdaEventHandler } from 'serverless-workflow/adapter';
import { type SQSHandler } from 'aws-lambda';
import { AppModule } from './app.module';

// Initialize NestJS application
const app = await NestFactory.createApplicationContext(AppModule);
await app.init();

// Export Lambda handler
export const handler: SQSHandler = LambdaEventHandler(app);
```

### Features

#### Automatic Timeout Handling

The Lambda adapter automatically manages Lambda timeouts:

- Tracks remaining execution time
- Gracefully stops processing before timeout
- Returns unprocessed messages for retry

```typescript
// Safety window: stops 5 seconds before Lambda timeout
const safetyWindowMs = context.getRemainingTimeInMillis() - 5000;
```

#### Batch Item Failures

Supports partial batch failures for efficient retry:

```typescript
// Failed messages are automatically marked for retry
return {
  batchItemFailures: [
    { itemIdentifier: 'message-id-1' },
    { itemIdentifier: 'message-id-2' },
  ],
};
```

### Configuration

#### SQS Event Source Mapping

Configure your Lambda function with SQS:

```yaml
# serverless.yml
functions:
  workflowHandler:
    handler: dist/lambda.handler
    events:
      - sqs:
          arn: !GetAtt WorkflowQueue.Arn
          batchSize: 10
          functionResponseType: ReportBatchItemFailures
    timeout: 300
```

**Important**: Set `functionResponseType: ReportBatchItemFailures` to enable partial batch failures.

#### Lambda Timeout

Set appropriate timeouts based on your workflow complexity:

```yaml
functions:
  workflowHandler:
    timeout: 300  # 5 minutes
```

The adapter will stop processing 5 seconds before this timeout to ensure graceful shutdown.

### Example Lambda Handler

```typescript
import { NestFactory } from '@nestjs/core';
import { LambdaEventHandler } from 'serverless-workflow/adapter';
import { type SQSHandler } from 'aws-lambda';
import { WorkflowModule } from 'serverless-workflow/workflow';
import { OrderWorkflow } from './order.workflow';
import { OrderEntityService } from './order-entity.service';
import { MySqsEmitter } from './sqs.emitter';

// Create NestJS application context
const app = await NestFactory.createApplicationContext(
  WorkflowModule.register({
    entities: [OrderEntityService],
    workflows: [OrderWorkflow],
    brokers: [MySqsEmitter],
  })
);
await app.init();

// Export handler
export const handler: SQSHandler = LambdaEventHandler(app);
```

### Advanced Usage

#### Custom Error Handling

```typescript
import { LambdaEventHandler } from 'serverless-workflow/adapter';
import { UnretriableException } from 'serverless-workflow/exception';

const app = await NestFactory.createApplicationContext(AppModule);

// Add custom error handling
app.useGlobalFilters({
  catch(exception: Error) {
    if (exception instanceof UnretriableException) {
      console.error('Unretriable error:', exception.message);
      // Don't retry this message
      return;
    }
    throw exception;
  },
});

export const handler = LambdaEventHandler(app);
```

#### Multiple Handlers

Create separate handlers for different workflows:

```typescript
// orderHandler.ts
const orderApp = await NestFactory.createApplicationContext(OrderModule);
export const handler = LambdaEventHandler(orderApp);

// userHandler.ts
const userApp = await NestFactory.createApplicationContext(UserModule);
export const handler = LambdaEventHandler(userApp);
```

Configure in `serverless.yml`:

```yaml
functions:
  orderWorkflow:
    handler: dist/orderHandler.handler
    events:
      - sqs:
          arn: !GetAtt OrderQueue.Arn

  userWorkflow:
    handler: dist/userHandler.handler
    events:
      - sqs:
          arn: !GetAtt UserQueue.Arn
```

## Creating Custom Adapters

You can create adapters for other runtimes:

### HTTP Adapter Example

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { OrchestratorService } from 'serverless-workflow/workflow';
import { IWorkflowEvent } from 'serverless-workflow/event-bus';

@Controller('workflow')
export class WorkflowController {
  constructor(private orchestrator: OrchestratorService) {}

  @Post('events')
  async handleEvent(@Body() event: IWorkflowEvent) {
    await this.orchestrator.transit(event);
    return { status: 'processed' };
  }
}
```

### EventBridge Adapter Example

```typescript
import { EventBridgeHandler } from 'aws-lambda';
import { OrchestratorService } from 'serverless-workflow/workflow';

export const handler: EventBridgeHandler<string, any, void> = async (event) => {
  const app = await getApp();
  const orchestrator = app.get(OrchestratorService);

  const workflowEvent = {
    urn: event.detail.entityId,
    event: event['detail-type'],
    payload: event.detail,
  };

  await orchestrator.transit(workflowEvent);
};
```

## Deployment

### Using Serverless Framework

```yaml
service: workflow-service

provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1

functions:
  workflowHandler:
    handler: dist/lambda.handler
    events:
      - sqs:
          arn: !GetAtt WorkflowQueue.Arn
          batchSize: 10
          functionResponseType: ReportBatchItemFailures
    timeout: 300
    environment:
      NODE_ENV: production

resources:
  Resources:
    WorkflowQueue:
      Type: AWS::SQS::Queue
      Properties:
        VisibilityTimeout: 360
        MessageRetentionPeriod: 1209600
        RedrivePolicy:
          deadLetterTargetArn: !GetAtt WorkflowDLQ.Arn
          maxReceiveCount: 3

    WorkflowDLQ:
      Type: AWS::SQS::Queue
      Properties:
        MessageRetentionPeriod: 1209600
```

### Using AWS CDK

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';

const queue = new sqs.Queue(this, 'WorkflowQueue', {
  visibilityTimeout: cdk.Duration.minutes(6),
  deadLetterQueue: {
    queue: dlq,
    maxReceiveCount: 3,
  },
});

const workflowFn = new lambda.Function(this, 'WorkflowHandler', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'dist/lambda.handler',
  code: lambda.Code.fromAsset('dist'),
  timeout: cdk.Duration.minutes(5),
});

workflowFn.addEventSource(
  new lambdaEventSources.SqsEventSource(queue, {
    batchSize: 10,
    reportBatchItemFailures: true,
  })
);
```

## Performance Optimization

### Cold Start Reduction

1. **Keep dependencies minimal**: Only import what you need
2. **Use tree-shaking**: Leverage subpath exports
3. **Optimize module initialization**: Use lazy loading where possible

```typescript
// Good: Only imports what's needed
import { LambdaEventHandler } from 'serverless-workflow/adapter';

// Bad: Imports everything
import * as Workflow from 'serverless-workflow';
```

### Memory Configuration

Set appropriate Lambda memory based on your workflow complexity:

```yaml
functions:
  workflowHandler:
    memorySize: 1024  # 1GB for complex workflows
```

Higher memory also increases CPU allocation, reducing execution time.

## Monitoring

### CloudWatch Logs

The adapter logs important events:

```typescript
console.log('Processing record', i + 1);
console.log('Completed processing. Failed items:', batchItemFailures.length);
```

### CloudWatch Metrics

Monitor these metrics:
- Lambda Duration
- Lambda Errors
- SQS Messages Received
- SQS Messages Deleted
- DLQ Message Count

### Custom Metrics

Add custom metrics for workflow events:

```typescript
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatch({});

await cloudwatch.putMetricData({
  Namespace: 'Workflow',
  MetricData: [
    {
      MetricName: 'TransitionsProcessed',
      Value: 1,
      Unit: 'Count',
    },
  ],
});
```

## Best Practices

1. **Set appropriate timeouts**: Match Lambda timeout to workflow complexity
2. **Use batch processing**: Process multiple events per invocation
3. **Enable batch item failures**: Don't reprocess successful messages
4. **Configure DLQs**: Capture persistently failing messages
5. **Monitor metrics**: Track processing times and error rates
6. **Use structured logging**: Include correlation IDs for tracing

## Examples

- [Lambda Handler](../examples/usage/lambda.ts)
- [Order Processing Example](../examples/order/)

## Related Documentation

- [Event Bus](./event-bus.md) - Configure message brokers
- [Workflow Module](./workflow.md) - Define workflows

