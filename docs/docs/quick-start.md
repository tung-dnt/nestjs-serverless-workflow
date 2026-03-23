# Quick Start

Get a workflow running in 5 minutes.

## Installation

```bash
bun add nestjs-serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs
```

## 1. Define Your Entity

```typescript
export enum OrderStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

export class Order {
  id: string;
  status: OrderStatus;
}
```

## 2. Create an Entity Service

The entity service tells the workflow engine how to load, save, and inspect your entities:

```typescript
import { Injectable } from '@nestjs/common';
import { IWorkflowEntity } from 'nestjs-serverless-workflow/core';

@Injectable()
export class OrderEntityService implements IWorkflowEntity<Order, OrderStatus> {
  async create(): Promise<Order> {
    // Create and persist a new order
  }

  async load(urn: string): Promise<Order | null> {
    // Load order from database
  }

  async update(entity: Order, status: OrderStatus): Promise<Order> {
    entity.status = status;
    // Persist and return
    return entity;
  }

  status(entity: Order): OrderStatus {
    return entity.status;
  }

  urn(entity: Order): string {
    return entity.id;
  }
}
```

## 3. Define a Workflow

```typescript
import { Workflow, OnEvent, Entity, Payload } from 'nestjs-serverless-workflow/core';

@Workflow({
  name: 'OrderWorkflow',
  states: {
    finals: [OrderStatus.Completed, OrderStatus.Failed],
    idles: [OrderStatus.Pending],
    failed: OrderStatus.Failed,
  },
  transitions: [
    {
      event: 'order.submit',
      from: [OrderStatus.Pending],
      to: OrderStatus.Processing,
    },
    {
      event: 'order.complete',
      from: [OrderStatus.Processing],
      to: OrderStatus.Completed,
    },
  ],
  entityService: 'entity.order',
})
export class OrderWorkflow {
  @OnEvent('order.submit')
  async onSubmit(@Entity() order: Order, @Payload() data: any) {
    console.log('Order submitted:', order.id);
    return order;
  }

  @OnEvent('order.complete')
  async onComplete(@Entity() order: Order) {
    console.log('Order completed:', order.id);
    return order;
  }
}
```

## 4. Register the Module

```typescript
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'nestjs-serverless-workflow/core';

@Module({
  imports: [
    WorkflowModule.register({
      entities: [
        { provide: 'entity.order', useClass: OrderEntityService },
      ],
      workflows: [OrderWorkflow],
    }),
  ],
})
export class OrderModule {}
```

## 5. Transit an Event

```typescript
import { OrchestratorService } from 'nestjs-serverless-workflow/core';

@Injectable()
export class MyService {
  constructor(private orchestrator: OrchestratorService) {}

  async submitOrder(orderId: string) {
    const result = await this.orchestrator.transit({
      event: 'order.submit',
      urn: orderId,
      payload: {},
      attempt: 0,
    });

    console.log(result.status); // 'final' | 'idle' | 'continued' | 'no_transition'
  }
}
```

## Next Steps

- [Workflow Concepts](./concepts/workflow) — states, transitions, and events in depth
- [TransitResult](./concepts/transit-result) — understand what `transit()` returns
- [Adapters](./concepts/adapters) — deploy to AWS Lambda with durable execution
- [Examples](./examples/lambda-order-state-machine) — complete working example
