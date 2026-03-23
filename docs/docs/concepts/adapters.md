# Adapters

Adapters drive workflows by calling `OrchestratorService.transit()` and reacting to the returned [TransitResult](./transit-result). The library ships with a durable Lambda adapter and exposes the interfaces needed to build your own.

## DurableLambdaEventHandler

The built-in adapter for AWS Lambda with the [Durable Execution SDK](https://docs.aws.amazon.com/lambda/latest/dg/durable-execution.html). It runs the entire workflow lifecycle inside a single durable execution, checkpointing at each step.

### Setup

```typescript
import { NestFactory } from '@nestjs/core';
import { DurableLambdaEventHandler } from 'nestjs-serverless-workflow/adapter';
import { withDurableExecution } from '@aws/durable-execution-sdk-js';
import { AppModule } from './app.module';

const app = await NestFactory.createApplicationContext(AppModule);
export const handler = DurableLambdaEventHandler(app, withDurableExecution);
```

### How It Works

The adapter loops over `transit()` calls, reacting to each `TransitResult`:

1. **`continued`** — Checkpoints the next event via `ctx.step()`, then calls `transit()` again with `nextEvent`.
2. **`idle`** — Pauses via `ctx.waitForCallback()`. An external system resumes the workflow by calling the Lambda `SendDurableExecutionCallbackSuccess` API.
3. **`no_transition`** — Also pauses via `ctx.waitForCallback()`, waiting for an explicit event.
4. **`final`** — Returns the completed result, ending the durable execution.

### Event Shape

The durable adapter expects a `DurableWorkflowEvent`:

```typescript
interface DurableWorkflowEvent {
  urn: string | number;
  initialEvent: string;
  payload?: any;
}
```

And returns a `DurableWorkflowResult`:

```typescript
interface DurableWorkflowResult {
  urn: string | number;
  status: string;
  state: string | number;
}
```

## IDurableContext

The `IDurableContext` interface abstracts the durable execution runtime. The real implementation comes from `@aws/durable-execution-sdk-js`; the interface is exported so you can mock it in tests.

```typescript
import type { IDurableContext } from 'nestjs-serverless-workflow/adapter';

interface IDurableContext {
  step<T>(name: string, fn: () => Promise<T>): Promise<T>;
  waitForCallback<T>(
    name: string,
    onRegister: (callbackId: string) => Promise<void>,
    options?: { timeout?: { hours?: number; minutes?: number; seconds?: number } },
  ): Promise<T>;
  wait(duration: { seconds?: number; minutes?: number; hours?: number }): Promise<void>;
  logger: { info(msg: string, data?: any): void };
}
```

## Testing with MockDurableContext

For tests, use a mock context that simulates checkpoint/replay and callbacks:

```typescript
import { Test } from '@nestjs/testing';
import { WorkflowModule } from 'nestjs-serverless-workflow/core';
import { DurableLambdaEventHandler } from 'nestjs-serverless-workflow/adapter';
import type { IDurableContext } from 'nestjs-serverless-workflow/adapter';

class MockDurableContext implements IDurableContext {
  private steps = new Map<string, any>();
  private callbacks = new Map<string, { resolve: (value: any) => void }>();

  logger = { info: (_msg: string, _data?: any) => {} };

  async step<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (this.steps.has(name)) return this.steps.get(name);
    const result = await fn();
    this.steps.set(name, result);
    return result;
  }

  async waitForCallback<T>(
    name: string,
    onRegister: (callbackId: string) => Promise<void>,
  ): Promise<T> {
    const callbackId = `callback:${name}`;
    let resolve: (value: any) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    this.callbacks.set(callbackId, { resolve: resolve! });
    await onRegister(callbackId);
    return promise;
  }

  async wait(): Promise<void> {}

  /** Submit a callback to resume the workflow. */
  submitCallback(name: string, payload: any): void {
    const entry = this.callbacks.get(`callback:${name}`);
    if (!entry) throw new Error(`No callback registered for: callback:${name}`);
    entry.resolve(payload);
  }
}

// Mock withDurableExecution — passes through to the raw handler
const mockWithDurableExecution = (handler) => handler as any;

// Usage in a test
const module = await Test.createTestingModule({
  imports: [
    WorkflowModule.register({
      entities: [{ provide: 'entity.order', useValue: new OrderEntityService() }],
      workflows: [OrderWorkflow],
    }),
  ],
}).compile();

const app = module.createNestApplication();
await app.init();

const handler = DurableLambdaEventHandler(app, mockWithDurableExecution);
const ctx = new MockDurableContext();

const resultPromise = handler(
  { urn: 'order-1', initialEvent: 'order.created', payload: {} },
  ctx,
);

// When the adapter reaches an idle state, submit a callback:
ctx.submitCallback('idle:pending:0', { event: 'order.submit', payload: {} });

const result = await resultPromise;
```

## Related Documentation

- [TransitResult](./transit-result) — understand what `transit()` returns
- [Human in the Loop](../recipes/human-in-the-loop) — idle state + callback pattern
- [Custom Adapter](../recipes/custom-adapter) — build your own adapter
