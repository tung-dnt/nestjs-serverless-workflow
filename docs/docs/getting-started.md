# Getting Started

This guide will help you get started with the nestjs-serverless-workflow library.

## Installation

Install the package and its peer dependencies:

```bash
# Using npm
npm install nestjs-serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs

# Using bun
bun add nestjs-serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs

# Using yarn
yarn add nestjs-serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs
```

## Basic Usage

### 1. Import the Workflow Module

```typescript
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'nestjs-serverless-workflow/core';

@Module({
  imports: [
    WorkflowModule.register({
      entities: [],
      workflows: [],
      brokers: [],
    }),
  ],
})
export class AppModule {}
```

### 2. Define Your Entity

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
  // ... other properties
}
```

### 3. Create a Workflow Definition

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
      from: [OrderStatus.Pending],
      to: OrderStatus.Processing,
      event: 'order.submit',
    },
    {
      from: [OrderStatus.Processing],
      to: OrderStatus.Completed,
      event: 'order.complete',
    },
  ],
  entityService: 'entity.order',
  brokerPublisher: 'broker.order',
})
export class OrderWorkflow {
  @OnEvent('order.submit')
  async onSubmit(@Entity() entity: Order, @Payload() data: any) {
    // Handle submit event
    console.log('Order submitted:', entity.id);
    return entity;
  }

  @OnEvent('order.complete')
  async onComplete(@Entity() entity: Order) {
    // Handle complete event
    console.log('Order completed:', entity.id);
    return entity;
  }
}
```

### 4. Create an Entity Service

```typescript
import { Injectable } from '@nestjs/common';
import { IWorkflowEntity } from 'nestjs-serverless-workflow/core';

@Injectable()
export class OrderEntityService implements IWorkflowEntity<Order, OrderStatus> {
  async create(): Promise<Order> {
    // Create new order
  }

  async load(urn: string): Promise<Order | null> {
    // Load order from database
  }

  async update(entity: Order, status: OrderStatus): Promise<Order> {
    // Update order status
  }

  status(entity: Order): OrderStatus {
    return entity.status;
  }

  urn(entity: Order): string {
    return entity.id;
  }
}
```

### 5. Register Everything

```typescript
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'nestjs-serverless-workflow/core';
import { OrderWorkflow } from './order.workflow';
import { OrderEntityService } from './order-entity.service';

@Module({
  imports: [
    WorkflowModule.register({
      entities: [
        { provide: 'entity.order', useClass: OrderEntityService },
      ],
      workflows: [OrderWorkflow],
      brokers: [
        { provide: 'broker.order', useClass: MySqsEmitter },
      ],
    }),
  ],
})
export class OrderModule {}
```

## Next Steps

- [Workflow Configuration](./workflow) - Learn about workflow states, transitions, and events
- [Event Bus Integration](./event-bus) - Connect to SQS and other message brokers
- [Lambda Adapter](./adapters) - Deploy your workflows to AWS Lambda
- [Examples](./examples/lambda-order-state-machine) - Explore complete working examples

## Tree-Shaking Benefits

The library uses subpath exports, which means your bundler can eliminate unused code:

```typescript
// Only imports what you need
import { WorkflowModule } from 'nestjs-serverless-workflow/core';
// No event-bus, adapter, or exception code is included in your bundle
```

This results in smaller bundle sizes and faster cold starts in serverless environments.

