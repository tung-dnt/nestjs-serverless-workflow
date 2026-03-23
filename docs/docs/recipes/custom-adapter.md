# Custom Adapter

Any adapter simply calls `orchestrator.transit()` in a loop and reacts to the returned [TransitResult](../concepts/transit-result). This recipe shows how to build adapters for different runtimes.

## The Pattern

```typescript
import { OrchestratorService } from 'nestjs-serverless-workflow/core';
import type { IWorkflowEvent, TransitResult } from 'nestjs-serverless-workflow/core';

async function runWorkflow(
  orchestrator: OrchestratorService,
  initialEvent: IWorkflowEvent,
): Promise<TransitResult> {
  let currentEvent = initialEvent;

  while (true) {
    const result = await orchestrator.transit(currentEvent);

    switch (result.status) {
      case 'final':
        return result;

      case 'idle':
        // Your adapter decides how to wait — poll a queue, wait for a webhook, etc.
        return result;

      case 'continued':
        // Feed the next event back into transit
        currentEvent = result.nextEvent;
        break;

      case 'no_transition':
        // No auto-transition — return and let the caller decide
        return result;
    }
  }
}
```

The key principle: **the orchestrator handles business logic and state transitions; the adapter handles infrastructure** (checkpointing, waiting, retry).

## HTTP Adapter

Use a NestJS controller to drive workflows via REST API:

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { OrchestratorService } from 'nestjs-serverless-workflow/core';
import type { IWorkflowEvent } from 'nestjs-serverless-workflow/core';

@Controller('workflow')
export class WorkflowController {
  constructor(private orchestrator: OrchestratorService) {}

  @Post('events')
  async handleEvent(@Body() event: IWorkflowEvent) {
    const result = await this.orchestrator.transit(event);
    return { status: result.status };
  }
}
```

## EventBridge Adapter

Process events from AWS EventBridge:

```typescript
import { EventBridgeHandler } from 'aws-lambda';
import { OrchestratorService } from 'nestjs-serverless-workflow/core';

export const handler: EventBridgeHandler<string, any, void> = async (event) => {
  const app = await getApp(); // cached NestJS app context
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

## When to Use What

| Adapter | Use when |
|---------|----------|
| **DurableLambdaEventHandler** | Long-running workflows that span multiple Lambda invocations, workflows with idle states that need callbacks |
| **HTTP adapter** | Simple request/response workflows, synchronous processing |
| **EventBridge adapter** | Event-driven architectures, fan-out patterns |
| **Custom loop** | Cron-based processing, batch jobs, custom infrastructure |

## Related Documentation

- [TransitResult](../concepts/transit-result) — understand the result types
- [DurableLambdaEventHandler](../concepts/adapters) — built-in durable adapter
- [Human in the Loop](./human-in-the-loop) — idle state + callback pattern
