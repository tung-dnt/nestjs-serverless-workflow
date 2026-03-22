# Introduction

[![npm version](https://img.shields.io/npm/v/nestjs-serverless-workflow.svg)](https://www.npmjs.com/package/nestjs-serverless-workflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful, tree-shakable workflow and state machine library for NestJS applications, optimized for serverless environments like AWS Lambda.

## Features

- 🎯 **State Machine Engine**: Define workflows with states, transitions, and events
- ⚡ **Serverless Optimized**: Built for AWS Lambda with durable execution support
- 🔄 **Durable Execution**: Checkpoint and replay workflows across Lambda invocations using AWS Durable Functions
- 📦 **Tree-Shakable**: Subpath exports ensure minimal bundle sizes
- 🛡️ **Type-Safe**: Full TypeScript support with comprehensive type definitions
- 🔁 **Retry Logic**: Built-in retry mechanisms with exponential backoff
- 🎨 **Decorator-Based API**: Clean, declarative workflow definitions

## Installation

```bash
# Using bun
bun add nestjs-serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs

# Using npm
npm install nestjs-serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs

# Using yarn
yarn add nestjs-serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs
```

## Quick Start

### 1. Define Your Entity

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

### 2. Create a Workflow

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
})
export class OrderWorkflow {
  @OnEvent('order.submit')
  async onSubmit(@Entity() entity: Order, @Payload() data: any) {
    console.log('Order submitted:', entity.id);
    return entity;
  }

  @OnEvent('order.complete')
  async onComplete(@Entity() entity: Order) {
    console.log('Order completed:', entity.id);
    return entity;
  }
}
```

### 3. Implement Entity Service

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

### 4. Register the Module

```typescript
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'nestjs-serverless-workflow/core';
import { OrderWorkflow } from './order.workflow';
import { OrderEntityService } from './order-entity.service';

@Module({
  imports: [
    WorkflowModule.register({
      entities: [{ provide: 'entity.order', useClass: OrderEntityService }],
      workflows: [OrderWorkflow],
    }),
  ],
})
export class OrderModule {}
```

## Documentation

📚 **[Full Documentation](https://tung-dnt.github.io/nestjs-serverless-workflow/)**

- [Getting Started](https://tung-dnt.github.io/nestjs-serverless-workflow/docs/getting-started)
- [Workflow Module](https://tung-dnt.github.io/nestjs-serverless-workflow/docs/workflow)
- [Lambda Adapter](https://tung-dnt.github.io/nestjs-serverless-workflow/docs/adapters)
- [API Reference](https://tung-dnt.github.io/nestjs-serverless-workflow/docs/api-reference/workflow-module)
- [Examples](https://tung-dnt.github.io/nestjs-serverless-workflow/docs/examples/lambda-order-state-machine)

## Package Structure

The library is organized into tree-shakable subpath exports:

```
nestjs-serverless-workflow/
├── core          # Core workflow engine (decorators, services, types, IWorkflowEvent)
├── adapter       # Durable Lambda adapter for checkpoint/replay execution
└── exception     # Custom exception types
```

### Import Only What You Need

```typescript
// Core workflow engine
import { WorkflowModule, IWorkflowEvent } from 'nestjs-serverless-workflow/core';

// Durable Lambda adapter
import { DurableLambdaEventHandler } from 'nestjs-serverless-workflow/adapter';

// Exceptions
import { UnretriableException } from 'nestjs-serverless-workflow/exception';
```

This ensures minimal bundle sizes and faster cold starts in serverless environments.

## Transit Result

The `transit()` method on the orchestrator returns a `TransitResult`, which adapters use to decide what to do next:

```typescript
type TransitResult =
  | { status: 'final'; state: string | number }
  | { status: 'idle'; state: string | number }
  | { status: 'continued'; nextEvent: IWorkflowEvent }
  | { status: 'no_transition'; state: string | number };
```

- **`final`** -- the workflow has reached a terminal state.
- **`idle`** -- the workflow is waiting for an external event.
- **`continued`** -- the workflow auto-transitioned and provides the next event to process.
- **`no_transition`** -- no matching transition was found from the current state.

## Examples

Check out the [examples directory](https://github.com/tung-dnt/nestjs-serverless-workflow/tree/main/examples) for complete working examples:

- **[Lambda Order State Machine](https://github.com/tung-dnt/nestjs-serverless-workflow/tree/main/examples/lambda-order-state-machine/)**: Complete AWS Lambda example with DynamoDB and durable execution

## Key Concepts

### States

States represent the different stages your entity can be in:

- **Finals**: Terminal states where the workflow ends
- **Idles**: States where the workflow waits for external events
- **Failed**: The failure state to transition to on errors

### Transitions

Transitions define how entities move from one state to another, triggered by events:

```typescript
{
  from: [OrderStatus.Pending],
  to: OrderStatus.Processing,
  event: 'order.submit',
  conditions: [
    (entity: Order, payload: any) => entity.items.length > 0,
  ],
}
```

### Events

Events trigger state transitions. The `IWorkflowEvent` interface (from `nestjs-serverless-workflow/core`) defines the shape of workflow events:

```typescript
interface IWorkflowEvent<T = any> {
  event: string;        // event name that triggers a transition
  urn: string | number; // unique identifier of the entity
  payload?: T;          // optional data passed to the handler
  attempt: number;      // retry attempt counter
}
```

Define event handlers using the `@OnEvent` decorator:

```typescript
@OnEvent('order.submit')
async onSubmit(@Entity() entity: Order, @Payload() data: any) {
  // Handle the event
}
```

## AWS Lambda Integration

The library includes a Durable Lambda adapter (`DurableLambdaEventHandler`) that leverages [AWS Lambda Durable Functions](https://aws.amazon.com/blogs/compute/) for checkpoint and replay. Each workflow instance runs as a single durable execution spanning multiple Lambda invocations:

- **Checkpointed steps** -- completed transitions are persisted; on replay they return stored results.
- **Idle state pausing** -- idle states pause via `waitForCallback()` until an external system resumes the workflow.
- **Final state completion** -- reaching a final state ends the durable execution.

```typescript
import { withDurableExecution } from '@aws/durable-execution-sdk-js';
import { NestFactory } from '@nestjs/core';
import { DurableLambdaEventHandler } from 'nestjs-serverless-workflow/adapter';
import { OrderModule } from './order/order.module';

const app = await NestFactory.createApplicationContext(OrderModule);
await app.init();

export const handler = DurableLambdaEventHandler(app, withDurableExecution);
```

## Requirements

- Node.js >= 20.0.0 or Bun >= 1.3.4
- NestJS >= 11.0.0
- TypeScript >= 5.0.0

## Contributing

Contributions are welcome! Please read our [Contributing Guide](https://github.com/tung-dnt/nestjs-serverless-workflow/tree/main/CONTRIBUTING.md) for details on:

- Code style and conventions
- Development setup
- Testing guidelines
- Pull request process

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/tung-dnt/nestjs-serverless-workflow/tree/main/LICENSE) file for details.

## Author

**Thomas Do (tung-dnt)**

- GitHub: [@tung-dnt](https://github.com/tung-dnt)
- Repository: [nestjs-serverless-workflow](https://github.com/tung-dnt/nestjs-serverless-workflow)

## Support

- 📖 [Documentation](https://tung-dnt.github.io/nestjs-serverless-workflow/)
- 🐛 [Issue Tracker](https://github.com/tung-dnt/nestjs-serverless-workflow/issues)
- 💬 [Discussions](https://github.com/tung-dnt/nestjs-serverless-workflow/discussions)

## Related Projects

- [NestJS](https://nestjs.com/) - A progressive Node.js framework
- [AWS Lambda](https://aws.amazon.com/lambda/) - Serverless compute service
- [AWS Lambda Durable Functions](https://docs.aws.amazon.com/lambda/latest/dg/durable-functions.html) - Durable execution for Lambda
