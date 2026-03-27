# TransitResult

Every call to `OrchestratorService.transit()` returns a `TransitResult` that tells the caller what happened and what to do next.

## Workflow Events

Events trigger state transitions. They follow the `IWorkflowEvent` interface:

```typescript
import type { IWorkflowEvent } from 'nestjs-serverless-workflow/core';

interface IWorkflowEvent<T = any> {
  event: string;           // Event name that triggers a transition
  urn: string | number;    // Unique identifier for the entity
  payload?: T | object | string; // Optional event data
  attempt: number;         // Retry attempt number (starts at 0)
}
```

## TransitResult Type

```typescript
type TransitResult =
  | { status: 'final'; state: string | number }
  | { status: 'idle'; state: string | number; timeout?: Duration }
  | { status: 'continued'; nextEvent: IWorkflowEvent }
  | { status: 'no_transition'; state: string | number; timeout?: Duration };
```

| Status | Meaning | What to do |
|--------|---------|-----------|
| `final` | Entity reached a terminal state. Workflow is complete. | Return the result — nothing more to do. |
| `idle` | Entity is in an idle state, waiting for an external event. | Wait for a callback, poll a queue, etc. Optional `timeout` hints how long to wait. |
| `continued` | A follow-up transition was found automatically. | Feed `nextEvent` back into `transit()` to continue processing. |
| `no_transition` | No unambiguous auto-transition from the current state. | Wait for an explicit event from an external system. |

## Usage

```typescript
import { OrchestratorService } from 'nestjs-serverless-workflow/core';
import type { TransitResult, IWorkflowEvent } from 'nestjs-serverless-workflow/core';

@Injectable()
export class MyService {
  constructor(private orchestrator: OrchestratorService) {}

  async processEvent(event: IWorkflowEvent) {
    const result: TransitResult = await this.orchestrator.transit(event);

    switch (result.status) {
      case 'final':
        console.log('Completed in state:', result.state);
        break;
      case 'idle':
        console.log('Idle at state:', result.state);
        break;
      case 'continued':
        console.log('Next event:', result.nextEvent);
        // Feed it back into transit() to continue
        await this.processEvent(result.nextEvent);
        break;
      case 'no_transition':
        console.log('Waiting at state:', result.state);
        break;
    }
  }
}
```

## How Adapters Use TransitResult

Adapters are the glue between your infrastructure and the orchestrator. They call `transit()` in a loop and react to each result:

- **`continued`** — checkpoint and call `transit()` again with `nextEvent`
- **`idle`** — pause and wait for an external callback or event
- **`no_transition`** — pause and wait for an explicit event
- **`final`** — return the completed result

### BaseWorkflowAdapter

The library provides `BaseWorkflowAdapter`, an abstract class that encapsulates this loop and dispatches each `TransitResult` variant to a dedicated handler method:

```typescript
import { BaseWorkflowAdapter } from 'nestjs-serverless-workflow/adapter';

// TContext = your runtime context (e.g. IDurableContext, Express Request)
// TResult  = the value your adapter returns when the workflow completes
abstract class BaseWorkflowAdapter<TContext, TResult> {
  protected runWorkflowLoop(initialEvent, ctx): Promise<TResult>;

  // Override these in your concrete adapter:
  protected abstract executeTransit(event, iteration, ctx): Promise<TransitResult>;
  protected abstract onFinal(result, event, ctx): TResult;
  protected abstract onIdle(result, event, iteration, ctx): Promise<IWorkflowEvent>;
  protected abstract onContinued(result, iteration, ctx): Promise<IWorkflowEvent>;
  protected abstract onNoTransition(result, event, iteration, ctx): Promise<IWorkflowEvent>;
}
```

Each handler method receives a **narrowed** result type (e.g. `Extract<TransitResult, { status: 'idle' }>`) so you get full type safety without manual switch statements.

The built-in [DurableLambdaEventHandler](./adapters) extends `BaseWorkflowAdapter` with AWS Lambda's durable execution SDK, including checkpointing and `waitForCallback()` support.

For writing your own adapter, see [Custom Adapter](../recipes/custom-adapter).
