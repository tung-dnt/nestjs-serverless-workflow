# Adapters

Adapters help integrate the workflow engine with different runtime environments.

## Installation

```typescript
import { LambdaEventHandler, LambdaStepHandler, createLambdaStepHandlers } from 'nestjs-serverless-workflow/adapter';
```

## Lambda Adapter

The Lambda adapter provides multiple ways to run workflows in AWS Lambda:

1. **`LambdaEventHandler`**: Full workflow orchestration with automatic transitions (SQS-triggered)
2. **`LambdaStepHandler`**: Single-step execution for AWS Step Functions integration
3. **`createLambdaStepHandlers`**: Creates individual handlers mapped to workflow events

### Option 1: Full Orchestration (LambdaEventHandler)

Use this when you want the library to manage the entire state machine internally via SQS.

```typescript
import { NestFactory } from '@nestjs/core';
import { LambdaEventHandler } from 'nestjs-serverless-workflow/adapter';
import { type SQSHandler } from 'aws-lambda';
import { AppModule } from './app.module';

// Initialize NestJS application
const app = await NestFactory.createApplicationContext(AppModule);
await app.init();

// Export Lambda handler
export const handler: SQSHandler = LambdaEventHandler(app);
```

### Option 2: Step Functions Integration (LambdaStepHandler)

Use this when AWS Step Functions manages the state machine externally. This is the recommended approach for durable workflows as it delegates state machine management to AWS.

```typescript
import { NestFactory } from '@nestjs/core';
import { LambdaStepHandler } from 'nestjs-serverless-workflow/adapter';
import { AppModule } from './app.module';

const app = await NestFactory.createApplicationContext(AppModule);
await app.init();

// Single handler that executes any workflow step
export const handler = LambdaStepHandler(app);
```

**Step Functions State Machine Definition (AWS CDK):**

```typescript
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

const createOrderTask = new tasks.LambdaInvoke(this, 'CreateOrder', {
  lambdaFunction: orderHandler,
  payload: sfn.TaskInput.fromObject({
    topic: 'order.created',
    'urn.$': '$.orderId',
    'payload.$': '$',
  }),
  resultPath: '$.stepResult',
});

const processOrderTask = new tasks.LambdaInvoke(this, 'ProcessOrder', {
  lambdaFunction: orderHandler,
  payload: sfn.TaskInput.fromObject({
    topic: 'order.processing',
    'urn.$': '$.stepResult.Payload.entity.id',
    'payload.$': '$.stepResult.Payload.handlerResult',
  }),
  resultPath: '$.stepResult',
});

const definition = createOrderTask
  .next(processOrderTask)
  .next(new sfn.Succeed(this, 'OrderComplete'));

new sfn.StateMachine(this, 'OrderStateMachine', {
  definition,
});
```

### Option 3: Per-Event Handlers (createLambdaStepHandlers)

Use this when you need separate Lambda functions for each workflow event.

```typescript
import { NestFactory } from '@nestjs/core';
import { createLambdaStepHandlers } from 'nestjs-serverless-workflow/adapter';
import { AppModule } from './app.module';

const app = await NestFactory.createApplicationContext(AppModule);
await app.init();

const handlers = createLambdaStepHandlers(app);

// Export individual handlers for each event
export const orderCreated = handlers.get('order.created');
export const orderProcessing = handlers.get('order.processing');
export const orderShipped = handlers.get('order.shipped');
```

## Step Execution Result

When using `LambdaStepHandler` or `createLambdaStepHandlers`, the handler returns:

```typescript
interface IStepExecutionResult {
  entity: any;        // The updated entity after executing the step
  status: string;     // The current status after the step
  isFinal: boolean;   // Whether the entity reached a final state
  handlerResult: any; // The payload returned by the handler
  event: string;      // The event that was executed
}
```

This result can be used by Step Functions to make decisions and pass data between steps.

## Features

### Automatic Timeout Handling (LambdaEventHandler)

The Lambda adapter automatically manages Lambda timeouts:

- Tracks remaining execution time
- Gracefully stops processing before timeout
- Returns unprocessed messages for retry

```typescript
// Safety window: stops 5 seconds before Lambda timeout
const safetyWindowMs = context.getRemainingTimeInMillis() - 5000;
```

### Batch Item Failures (LambdaEventHandler)

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

## Configuration

### SQS Event Source Mapping (for LambdaEventHandler)

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

### Lambda Timeout

Set appropriate timeouts based on your workflow complexity:

```yaml
functions:
  workflowHandler:
    timeout: 300  # 5 minutes
```

The adapter will stop processing 5 seconds before this timeout to ensure graceful shutdown.

## When to Use Each Approach

| Approach | Use Case |
|----------|----------|
| `LambdaEventHandler` | Simple workflows, SQS-driven, library manages state machine |
| `LambdaStepHandler` | Complex workflows, AWS Step Functions manages orchestration |
| `createLambdaStepHandlers` | Fine-grained deployment, separate Lambda per event |

### Benefits of Step Functions Integration

- **Durable execution**: AWS manages state persistence and retries
- **Visual workflow**: AWS Console provides workflow visualization
- **Built-in patterns**: Parallel execution, error handling, wait states
- **No duplicated logic**: State machine logic lives in Step Functions, not in code

## Creating Custom Adapters

You can create adapters for other runtimes:

### HTTP Adapter Example

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { OrchestratorService } from 'nestjs-serverless-workflow/core';
import { IWorkflowEvent } from 'nestjs-serverless-workflow/event-bus';

@Controller('workflow')
export class WorkflowController {
  constructor(private orchestrator: OrchestratorService) {}

  @Post('events')
  async handleEvent(@Body() event: IWorkflowEvent) {
    await this.orchestrator.transit(event);
    return { status: 'processed' };
  }

  @Post('step')
  async handleStep(@Body() event: IWorkflowEvent) {
    const result = await this.orchestrator.executeStep(event);
    return result;
  }
}
```

### EventBridge Adapter Example

```typescript
import { EventBridgeHandler } from 'aws-lambda';
import { OrchestratorService } from 'nestjs-serverless-workflow/core';

export const handler: EventBridgeHandler<string, any, void> = async (event) => {
  const app = await getApp();
  const orchestrator = app.get(OrchestratorService);

  const workflowEvent = {
    topic: event['detail-type'],
    urn: event.detail.entityId,
    payload: event.detail,
    attempt: 0,
  };

  await orchestrator.transit(workflowEvent);
};
```

## Performance Optimization

### Cold Start Reduction

1. **Keep dependencies minimal**: Only import what you need
2. **Use tree-shaking**: Leverage subpath exports
3. **Optimize module initialization**: Use lazy loading where possible

```typescript
// Good: Only imports what's needed
import { LambdaStepHandler } from 'nestjs-serverless-workflow/adapter';

// Bad: Imports everything
import * as Workflow from 'nestjs-serverless-workflow';
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
console.log(`Executing step for event: ${event.topic}, urn: ${event.urn}`);
console.log(`Step completed. Status: ${result.status}, isFinal: ${result.isFinal}`);
```

### CloudWatch Metrics

Monitor these metrics:
- Lambda Duration
- Lambda Errors
- SQS Messages Received
- SQS Messages Deleted
- DLQ Message Count
- Step Functions Execution Success/Failure

## Best Practices

1. **Choose the right adapter**: Use Step Functions for durable workflows
2. **Set appropriate timeouts**: Match Lambda timeout to workflow complexity
3. **Use batch processing**: Process multiple events per invocation (for SQS)
4. **Enable batch item failures**: Don't reprocess successful messages
5. **Configure DLQs**: Capture persistently failing messages
6. **Monitor metrics**: Track processing times and error rates
7. **Use structured logging**: Include correlation IDs for tracing

## Related Documentation

- [Event Bus](./event-bus) - Configure message brokers
- [Workflow Module](./workflow) - Define workflows

