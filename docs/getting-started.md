# Getting Started

This guide will help you get started with the serverless-workflow library.

## Installation

Install the package and its peer dependencies:

```bash
# Using npm
npm install serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs

# Using bun
bun add serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs

# Using yarn
yarn add serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs
```

## Basic Usage

### 1. Import the Workflow Module

```typescript
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'serverless-workflow/workflow';

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
import { Workflow, OnEvent, Entity, Payload } from 'serverless-workflow/workflow';

@Workflow({
  states: {
    finals: [OrderStatus.Completed, OrderStatus.Failed],
    idles: [OrderStatus.Pending, OrderStatus.Processing],
    failed: OrderStatus.Failed,
  },
  transitions: [
    {
      from: OrderStatus.Pending,
      to: OrderStatus.Processing,
      event: 'order.submit',
    },
    {
      from: OrderStatus.Processing,
      to: OrderStatus.Completed,
      event: 'order.complete',
    },
  ],
})
export class OrderWorkflow {
  @OnEvent('order.submit')
  async onSubmit(@Entity entity: Order, @Payload() data: any) {
    // Handle submit event
    console.log('Order submitted:', entity.id);
    return entity;
  }

  @OnEvent('order.complete')
  async onComplete(@Entity entity: Order) {
    // Handle complete event
    console.log('Order completed:', entity.id);
    return entity;
  }
}
```

### 4. Create an Entity Service

```typescript
import { Injectable } from '@nestjs/common';
import { IWorkflowEntity } from 'serverless-workflow/workflow';

@Injectable()
export class OrderEntityService implements IWorkflowEntity<Order> {
  async load(urn: string): Promise<Order | null> {
    // Load entity from your data source
    return await this.repository.findOne({ id: urn });
  }

  async save(entity: Order): Promise<Order> {
    // Save entity to your data source
    return await this.repository.save(entity);
  }

  getStatus(entity: Order): string {
    return entity.status;
  }

  setStatus(entity: Order, status: string): Order {
    entity.status = status as OrderStatus;
    return entity;
  }

  getUrn(entity: Order): string {
    return entity.id;
  }
}
```

### 5. Register Everything

```typescript
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'serverless-workflow/workflow';
import { OrderWorkflow } from './order.workflow';
import { OrderEntityService } from './order-entity.service';

@Module({
  imports: [
    WorkflowModule.register({
      entities: [OrderEntityService],
      workflows: [OrderWorkflow],
      brokers: [],
    }),
  ],
})
export class OrderModule {}
```

## Next Steps

- [Workflow Configuration](./workflow.md) - Learn about workflow states, transitions, and events
- [Event Bus Integration](./event-bus.md) - Connect to SQS and other message brokers
- [Lambda Adapter](./adapters.md) - Deploy your workflows to AWS Lambda
- [Examples](../examples/) - Explore complete working examples

## Tree-Shaking Benefits

The library uses subpath exports, which means your bundler can eliminate unused code:

```typescript
// Only imports what you need
import { WorkflowModule } from 'serverless-workflow/workflow';
// No event-bus, adapter, or exception code is included in your bundle
```

This results in smaller bundle sizes and faster cold starts in serverless environments.

