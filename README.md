# NestJS Serverless Workflow

[![npm version](https://img.shields.io/npm/v/nestjs-serverless-workflow.svg)](https://www.npmjs.com/package/nestjs-serverless-workflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful, tree-shakable workflow and state machine library for NestJS applications, optimized for serverless environments like AWS Lambda.

## Features

- 🎯 **State Machine Engine**: Define workflows with states, transitions, and events
- 🔄 **Event-Driven Architecture**: Integrate with message brokers (SQS, Kafka, RabbitMQ, etc.)
- ⚡ **Serverless Optimized**: Built for AWS Lambda with automatic timeout handling
- 📦 **Tree-Shakable**: Subpath exports ensure minimal bundle sizes
- 🛡️ **Type-Safe**: Full TypeScript support with comprehensive type definitions
- 🔁 **Retry Logic**: Built-in retry mechanisms with exponential backoff
- 🎨 **Decorator-Based API**: Clean, declarative workflow definitions
- 📊 **Saga Pattern Support**: Distributed transaction management

## Installation

```bash
# Using npm
npm install nestjs-serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs

# Using bun
bun add nestjs-serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs

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
  brokerPublisher: 'broker.order',
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

## Documentation

📚 **[Full Documentation](https://tung-dnt.github.io/nestjs-serverless-workflow/)**

- [Getting Started](https://tung-dnt.github.io/nestjs-serverless-workflow/docs/getting-started)
- [Workflow Module](https://tung-dnt.github.io/nestjs-serverless-workflow/docs/workflow)
- [Event Bus](https://tung-dnt.github.io/nestjs-serverless-workflow/docs/event-bus)
- [Lambda Adapter](https://tung-dnt.github.io/nestjs-serverless-workflow/docs/adapters)
- [API Reference](https://tung-dnt.github.io/nestjs-serverless-workflow/docs/api-reference/workflow-module)
- [Examples](https://tung-dnt.github.io/nestjs-serverless-workflow/docs/examples/lambda-order-state-machine)

## Package Structure

The library is organized into tree-shakable subpath exports:

```
nestjs-serverless-workflow/
├── core          # Core workflow engine (decorators, services, types)
├── event-bus     # Event publishing and broker integration
├── adapter       # Runtime adapters (Lambda, HTTP)
└── exception     # Custom exception types
```

### Import Only What You Need

```typescript
// Only imports workflow module
import { WorkflowModule } from 'nestjs-serverless-workflow/core';

// Only imports event bus
import { IBrokerPublisher } from 'nestjs-serverless-workflow/event-bus';

// Only imports Lambda adapter
import { LambdaEventHandler } from 'nestjs-serverless-workflow/adapter';

// Only imports exceptions
import { UnretriableException } from 'nestjs-serverless-workflow/exception';
```

This ensures minimal bundle sizes and faster cold starts in serverless environments.

## Examples

Check out the [examples directory](./examples/) for complete working examples:

- **[Lambda Order State Machine](./examples/lambda-order-state-machine/)**: Complete AWS Lambda example with SQS and DynamoDB

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

Events trigger state transitions. Define event handlers using the `@OnEvent` decorator:

```typescript
@OnEvent('order.submit')
async onSubmit(@Entity() entity: Order, @Payload() data: any) {
  // Handle the event
}
```

## AWS Lambda Integration

The library includes a Lambda adapter that handles:

- Automatic timeout management
- Batch item failures
- Graceful shutdown before timeout
- SQS event source integration

```typescript
import { LambdaEventHandler } from 'nestjs-serverless-workflow/adapter';
import { type SQSHandler } from 'aws-lambda';

const app = await NestFactory.createApplicationContext(AppModule);
export const handler: SQSHandler = LambdaEventHandler(app);
```

## Requirements

- Node.js >= 20.0.0 or Bun >= 1.3.4
- NestJS >= 11.0.0
- TypeScript >= 5.0.0

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details on:

- Code style and conventions
- Development setup
- Testing guidelines
- Pull request process

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

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
- [AWS SQS](https://aws.amazon.com/sqs/) - Message queuing service

