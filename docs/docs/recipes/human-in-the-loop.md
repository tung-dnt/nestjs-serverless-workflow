# Human in the Loop

This recipe shows how to pause a workflow for human approval and resume it via an external callback.

## The Pattern

1. Define an **idle state** where the workflow waits (e.g., `PENDING_APPROVAL`)
2. The adapter pauses at idle states using `waitForCallback()`
3. A human reviews and approves via your UI/API
4. Your backend calls `SendDurableExecutionCallbackSuccess` to resume the workflow

## Workflow Definition

```typescript
import { Workflow, OnEvent, Entity, Payload } from 'nestjs-serverless-workflow/core';

enum OrderState {
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  SHIPPED = 'shipped',
  REJECTED = 'rejected',
  FAILED = 'failed',
}

@Workflow({
  name: 'OrderWorkflow',
  states: {
    finals: [OrderState.SHIPPED, OrderState.REJECTED],
    idles: [OrderState.PENDING_APPROVAL],  // <-- workflow pauses here
    failed: OrderState.FAILED,
  },
  transitions: [
    {
      event: 'order.created',
      from: [OrderState.PENDING_APPROVAL],
      to: OrderState.APPROVED,
      conditions: [(_entity, payload?: { approved: boolean }) => payload?.approved === true],
    },
    {
      event: 'order.created',
      from: [OrderState.PENDING_APPROVAL],
      to: OrderState.REJECTED,
      conditions: [(_entity, payload?: { approved: boolean }) => payload?.approved === false],
    },
    {
      event: 'order.ship',
      from: [OrderState.APPROVED],
      to: OrderState.SHIPPED,
    },
  ],
  entityService: 'entity.order',
})
export class OrderWorkflow {
  @OnEvent('order.created')
  async onCreated(@Entity() order: Order, @Payload() payload: any) {
    return { reviewedAt: new Date().toISOString() };
  }

  @OnEvent('order.ship')
  async onShip(@Entity() order: Order) {
    return { shippedAt: new Date().toISOString() };
  }
}
```

## How It Works with DurableLambdaEventHandler

When the workflow starts, the entity is created in `PENDING_APPROVAL` state. Since this is an idle state, the adapter calls `ctx.waitForCallback()` and pauses execution:

```
1. Event: { urn: 'order-1', initialEvent: 'order.created', payload: {} }
2. Orchestrator sees entity is in PENDING_APPROVAL (idle) → returns { status: 'idle' }
3. Adapter calls ctx.waitForCallback('idle:pending_approval:0', ...)
4. Execution pauses — Lambda returns, but durable execution stays open
```

## Resuming via Callback

When a human approves the order, your API calls the Lambda `SendDurableExecutionCallbackSuccess` API:

```typescript
import { LambdaClient, SendDurableExecutionCallbackSuccessCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});

// The callbackId was logged by the adapter when it paused
await lambda.send(new SendDurableExecutionCallbackSuccessCommand({
  CallbackId: callbackId,
  Result: JSON.stringify({
    event: 'order.created',
    payload: { approved: true },
  }),
}));
```

The callback payload must include an `event` name and optional `payload`. The adapter parses this and feeds it back into `orchestrator.transit()`.

## Approval API Example

```typescript
import { Controller, Post, Param, Body } from '@nestjs/common';
import { LambdaClient, SendDurableExecutionCallbackSuccessCommand } from '@aws-sdk/client-lambda';

@Controller('orders')
export class OrderApprovalController {
  private lambda = new LambdaClient({});

  @Post(':id/approve')
  async approve(@Param('id') orderId: string, @Body() body: { callbackId: string }) {
    await this.lambda.send(new SendDurableExecutionCallbackSuccessCommand({
      CallbackId: body.callbackId,
      Result: JSON.stringify({
        event: 'order.created',
        payload: { approved: true },
      }),
    }));
    return { status: 'approved' };
  }

  @Post(':id/reject')
  async reject(@Param('id') orderId: string, @Body() body: { callbackId: string }) {
    await this.lambda.send(new SendDurableExecutionCallbackSuccessCommand({
      CallbackId: body.callbackId,
      Result: JSON.stringify({
        event: 'order.created',
        payload: { approved: false },
      }),
    }));
    return { status: 'rejected' };
  }
}
```

## Testing

Use `MockDurableContext` to simulate the callback flow:

```typescript
const handler = DurableLambdaEventHandler(app, mockWithDurableExecution);
const ctx = new MockDurableContext();

// Start workflow — it will pause at PENDING_APPROVAL
const resultPromise = handler(
  { urn: 'order-1', initialEvent: 'order.created', payload: {} },
  ctx,
);

// Simulate human approval
ctx.submitCallback('idle:pending_approval:0', {
  event: 'order.created',
  payload: { approved: true },
});

const result = await resultPromise;
// result.status === 'completed', result.state === 'shipped'
```

See [Testing with MockDurableContext](../concepts/adapters#testing-with-mockdurablecontext) for the full mock implementation.

## Timeout

The `timeout` field on TransitResult's idle status controls how long the adapter waits before timing out. You can configure this through your workflow's transition definitions. The default is 24 hours.
