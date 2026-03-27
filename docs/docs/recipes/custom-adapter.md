# Custom Adapter

Build your own adapter by extending `BaseWorkflowAdapter` — the abstract class that owns the orchestration loop and dispatches each [TransitResult](../concepts/transit-result) to a handler method you implement.

## Extending BaseWorkflowAdapter

```typescript
import { BaseWorkflowAdapter } from 'nestjs-serverless-workflow/adapter';
import { OrchestratorService } from 'nestjs-serverless-workflow/core';
import type { IWorkflowEvent, TransitResult } from 'nestjs-serverless-workflow/core';
```

The base class has two type parameters:

| Parameter | Meaning |
|-----------|---------|
| `TContext` | Your adapter's execution context (e.g. HTTP request, durable context, queue message) |
| `TResult` | The value returned when the workflow reaches a final state |

Override these five methods:

| Method | Called when | Return |
|--------|-----------|--------|
| `executeTransit` | Each loop iteration — run `orchestrator.transit()` with optional retry/checkpointing | `TransitResult` |
| `onFinal` | Workflow reached a terminal state | `TResult` (ends the loop) |
| `onIdle` | Entity is idle, waiting for external callback | Next `IWorkflowEvent` |
| `onContinued` | Auto-transition found | Next `IWorkflowEvent` |
| `onNoTransition` | No clear next step — needs explicit event | Next `IWorkflowEvent` |

## Example: HTTP Adapter

An adapter that drives workflows via REST API, returning immediately on idle/no-transition states:

```typescript
import { BaseWorkflowAdapter } from 'nestjs-serverless-workflow/adapter';
import { OrchestratorService } from 'nestjs-serverless-workflow/core';
import type { IWorkflowEvent, TransitResult } from 'nestjs-serverless-workflow/core';

interface HttpContext {
  requestId: string;
}

interface HttpWorkflowResult {
  status: string;
  state: string | number;
  message?: string;
}

class HttpWorkflowAdapter extends BaseWorkflowAdapter<HttpContext, HttpWorkflowResult> {
  constructor(orchestrator: OrchestratorService) {
    super(orchestrator);
  }

  protected async executeTransit(
    event: IWorkflowEvent,
    _iteration: number,
    _ctx: HttpContext,
  ): Promise<TransitResult> {
    // Simple — no retry or checkpointing needed for synchronous HTTP
    return this.orchestrator.transit(event);
  }

  protected onFinal(
    result: Extract<TransitResult, { status: 'final' }>,
  ): HttpWorkflowResult {
    return { status: 'completed', state: result.state };
  }

  protected async onIdle(
    result: Extract<TransitResult, { status: 'idle' }>,
  ): Promise<IWorkflowEvent> {
    // HTTP adapters typically don't wait — throw or return a response
    throw { status: 'waiting', state: result.state, message: 'Awaiting callback' };
  }

  protected async onContinued(
    result: Extract<TransitResult, { status: 'continued' }>,
  ): Promise<IWorkflowEvent> {
    return result.nextEvent;
  }

  protected async onNoTransition(
    result: Extract<TransitResult, { status: 'no_transition' }>,
  ): Promise<IWorkflowEvent> {
    throw { status: 'waiting', state: result.state, message: 'No auto-transition available' };
  }
}
```

Wire it up in a NestJS controller:

```typescript
@Controller('workflow')
export class WorkflowController {
  private adapter: HttpWorkflowAdapter;

  constructor(orchestrator: OrchestratorService) {
    this.adapter = new HttpWorkflowAdapter(orchestrator);
  }

  @Post('events')
  async handleEvent(@Body() body: { event: string; urn: string; payload?: any }) {
    return this.adapter.run({
      event: body.event,
      urn: body.urn,
      payload: body.payload,
      attempt: 0,
    });
  }
}
```

## Example: EventBridge Adapter

Process events from AWS EventBridge with fire-and-forget semantics:

```typescript
import { BaseWorkflowAdapter } from 'nestjs-serverless-workflow/adapter';
import { OrchestratorService } from 'nestjs-serverless-workflow/core';
import type { IWorkflowEvent, TransitResult } from 'nestjs-serverless-workflow/core';

class EventBridgeAdapter extends BaseWorkflowAdapter<void, void> {
  constructor(orchestrator: OrchestratorService) {
    super(orchestrator);
  }

  protected async executeTransit(event: IWorkflowEvent): Promise<TransitResult> {
    return this.orchestrator.transit(event);
  }

  protected onFinal(): void {
    // Fire-and-forget — nothing to return
  }

  protected async onIdle(
    result: Extract<TransitResult, { status: 'idle' }>,
  ): Promise<IWorkflowEvent> {
    // Publish an event for external systems to pick up
    throw new Error(`Entity paused at ${result.state} — publish callback event externally`);
  }

  protected async onContinued(
    result: Extract<TransitResult, { status: 'continued' }>,
  ): Promise<IWorkflowEvent> {
    return result.nextEvent;
  }

  protected async onNoTransition(
    result: Extract<TransitResult, { status: 'no_transition' }>,
  ): Promise<IWorkflowEvent> {
    throw new Error(`No transition from ${result.state} — publish event externally`);
  }
}
```

## The Raw Pattern

If you prefer not to extend the base class, the underlying pattern is straightforward — call `transit()` in a loop and switch on the result:

```typescript
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
        return result;
      case 'continued':
        currentEvent = result.nextEvent;
        break;
      case 'no_transition':
        return result;
    }
  }
}
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
