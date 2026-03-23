# Adapters

Adapters integrate the workflow engine with different runtime environments.

## LambdaEventHandler

Factory function that creates an AWS Lambda handler for SQS events.

### Import

```typescript
import { LambdaEventHandler } from 'nestjs-serverless-workflow/adapter';
```

### Signature

```typescript
LambdaEventHandler(app: INestApplicationContext): SQSHandler
```

### Parameters

- `app`: NestJS application context containing the workflow module

### Returns

An AWS Lambda SQS handler function.

### Features

- **Automatic Timeout Handling**: Stops processing 5 seconds before Lambda timeout
- **Batch Item Failures**: Supports partial batch failures for efficient retry
- **Graceful Shutdown**: Ensures messages are properly handled before timeout
- **Error Handling**: Automatically marks failed messages for retry

### Example

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

### Behavior

1. Processes SQS records in parallel
2. Tracks remaining Lambda execution time
3. Stops processing 5 seconds before timeout
4. Returns unprocessed messages for retry
5. Handles errors gracefully with batch item failures

### Configuration

#### SQS Event Source Mapping

```yaml
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

The adapter automatically stops processing 5 seconds before the Lambda timeout:

```yaml
functions:
  workflowHandler:
    timeout: 300  # 5 minutes
```

### Return Value

The handler returns an object with batch item failures:

```typescript
{
  batchItemFailures: [
    { itemIdentifier: 'message-id-1' },
    { itemIdentifier: 'message-id-2' },
  ]
}
```

### Error Handling

- Failed messages are automatically added to `batchItemFailures`
- Messages that timeout are marked for retry
- Unprocessed messages are returned for SQS to retry

### Performance Considerations

- Processes messages in parallel for better throughput
- Tracks processed messages to avoid duplicate processing
- Gracefully handles Lambda timeouts
- Optimized for serverless cold starts

## Creating Custom Adapters

You can create adapters for other runtimes by using the `OrchestratorService` directly.

### HTTP Adapter Example

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { OrchestratorService } from 'nestjs-serverless-workflow/core';
import type { IWorkflowEvent } from 'nestjs-serverless-workflow/core';

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
import { OrchestratorService } from 'nestjs-serverless-workflow/core';

export const handler: EventBridgeHandler<string, any, void> = async (event) => {
  const app = await getApp();
  const orchestrator = app.get(OrchestratorService);

  const workflowEvent = {
    event: event['detail-type'],
    urn: event.detail.entityId,
    payload: event.detail,
    attempt: 0,
  };

  await orchestrator.transit(workflowEvent);
};
```

## DurableLambdaEventHandler

Factory function that creates a durable Lambda handler for long-running workflows with checkpoint/replay.

### Import

```typescript
import { DurableLambdaEventHandler } from 'nestjs-serverless-workflow/adapter';
```

### Signature

```typescript
DurableLambdaEventHandler(
  app: INestApplicationContext,
  withDurableExecution: WithDurableExecution,
): (event: DurableWorkflowEvent, ctx: IDurableContext) => Promise<DurableWorkflowResult>
```

### Parameters

- `app`: NestJS application context containing the workflow module
- `withDurableExecution`: The `withDurableExecution` function from `@aws/durable-execution-sdk-js`

### Example

```typescript
import { NestFactory } from '@nestjs/core';
import { DurableLambdaEventHandler } from 'nestjs-serverless-workflow/adapter';
import { withDurableExecution } from '@aws/durable-execution-sdk-js';
import { AppModule } from './app.module';

const app = await NestFactory.createApplicationContext(AppModule);
export const handler = DurableLambdaEventHandler(app, withDurableExecution);
```

### Features

- **Checkpoint/Replay**: Steps are checkpointed at event boundaries — on replay, completed steps return stored results
- **Idle State Callbacks**: Pauses via `waitForCallback()` when workflow reaches an idle state
- **Retry with Backoff**: Respects `@WithRetry()` configuration with durable waits between attempts
- **Configurable Timeout**: `idle` and `no_transition` states support a `timeout` field (default: 24 hours)

See [Adapters concept guide](../concepts/adapters) for detailed usage.

## Related

- [Adapters Guide](../concepts/adapters)
- [OrchestratorService](./services#orchestratorservice)
- [IWorkflowEvent](./interfaces#iworkflowevent)

