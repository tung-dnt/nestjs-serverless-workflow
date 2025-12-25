<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://joseescrich.com/logos/nestjs-workflow.png">
  <source media="(prefers-color-scheme: light)" srcset="https://joseescrich.com/logos/nestjs-workflow-light.png">
  <img src="https://joseescrich.com/logos/nestjs-workflow.png" alt="NestJS Workflow Logo" width="200" style="margin-bottom:20px">
</picture>

# NestJS Workflow & State Machine

A flexible workflow engine built on top of NestJS framework, enabling developers to create, manage, and execute complex workflows in their Node.js applications.

## 🎯 Live Examples & Demos

Explore fully functional examples with **interactive visual demos** in our dedicated examples repository:

### 👉 **[View Examples](https://github.com/tung-dnt/nestjs-serverless-workflow/tree/main/examples)**

The repository includes three comprehensive real-world examples:

1. **🚀 User Onboarding Workflow** - Multi-step verification, KYC/AML compliance, risk assessment
2. **📦 Order Processing System** - Complete e-commerce lifecycle with payment retry logic
3. **📊 Kafka-Driven Inventory** - Real-time event-driven inventory management with Kafka integration

Each example features:

- ✨ **Interactive Visual Mode** - See workflows in action with real-time state visualization
- 🎮 **Interactive Controls** - Manually trigger transitions and explore different paths
- 🤖 **Automated Scenarios** - Pre-built test cases demonstrating various workflow paths
- 📝 **Full Source Code** - Production-ready implementations you can adapt

**[➡️ Get Started with Examples](https://github.com/tung-dnt/nestjs-serverless-workflow/tree/main/examples#-quick-start)**

## Table of Contents

- [Features](#features)
- [Stateless Architecture](#stateless-architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Module Registration](#module-registration)
- [Define a Workflow](#define-a-workflow)
- [Message Format](#message-format)
- [Configuring Actions and Conditions](#configuring-actions-and-conditions)
- [Complete Example with Kafka Integration](#complete-example-with-kafka-integration)

## Features

- **🌲 Tree-Shakable**: Modular architecture with subpath exports ensures minimal bundle size
- **Workflow Definitions**: Define workflows using a simple, declarative syntax
- **State Management**: Track and persist workflow states
- **Event-Driven Architecture**: Built on NestJS's event system for flexible workflow triggers
- **Transition Rules**: Configure complex transition conditions between workflow states
- **Extensible**: Easily extend with custom actions, conditions, and triggers
- **TypeScript Support**: Full TypeScript support with strong typing
- **Integration Friendly**: Seamlessly integrates with existing NestJS applications
- **Message Broker Integration**: Easily integrate with SQS, Kafka, RabbitMQ, and more
- **Stateless Design**: Lightweight implementation with no additional storage requirements
- **Serverless Ready**: Optimized for AWS Lambda with automatic timeout handling

## 📚 Documentation

Comprehensive documentation is available:
- **[Getting Started](./docs/getting-started.md)** - Installation and basic usage
- **[Workflow Module](./docs/workflow.md)** - State machines and transitions
- **[Event Bus](./docs/event-bus.md)** - Message broker integration
- **[Adapters](./docs/adapters.md)** - Runtime environment adapters
- **[API Documentation](./docs/)** - Full API reference

Online documentation: https://@nestjs-serverless-workflow.github.io/libraries/docs/workflow/intro

# Stateless Architecture

## NestJS Workflow is designed with a stateless architecture, which offers several key benefits

Benefits of Stateless Design

- Simplicity: No additional database or storage configuration required
- Domain-Driven: State is maintained within your domain entities where it belongs
- Lightweight: Minimal overhead and dependencies
- Scalability: Easily scales horizontally with your application
- Flexibility: Works with any persistence layer or storage mechanism
- Integration: Seamlessly integrates with your existing data model and repositories
- The workflow engine doesn't maintain any state itself - instead, it operates on your domain entities, reading their current state and applying transitions according to your defined rules. This approach aligns with domain-driven design principles by keeping the state with the entity it belongs to.

This stateless design means you can:

Use your existing repositories and data access patterns
Persist workflow state alongside your entity data
Avoid complex synchronization between separate state stores
Maintain transactional integrity with your domain operations

```
// Example of how state is part of your domain entity
export class Order {
  id: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus; // The workflow state is a property of your entity

  // Your domain logic here
}
```

The workflow engine simply reads and updates this state property according to your defined transitions, without needing to maintain any separate state storage.

## Installation

```bash
npm install nestjs-serverless-workflow
```

Or using bun:

```bash
bun add nestjs-serverless-workflow
```

Or using yarn:

```bash
yarn add nestjs-serverless-workflow
```

### Peer Dependencies

This library requires the following peer dependencies:

```bash
npm install @nestjs/common @nestjs/core reflect-metadata rxjs
```

**Optional Dependencies** (only if you need specific features):

- For AWS Lambda adapter: `@types/aws-lambda`
- For SQS integration: `@aws-sdk/client-sqs`
- For DynamoDB: `@aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb`

## Quick Start

### 🎮 Try the Interactive Demos First

Before diving into code, experience workflows visually with our interactive demos:

```bash
# Quick demo setup
git clone https://github.com/tung-dnt/nestjs-serverless-workflow/tree/main/examples.git
cd nestjs-workflow-examples/01-user-onboarding
bun install && bun local
```

You'll see an interactive workflow visualization like this:

```
╔══════════════╗     ┌──────────────┐     ┌────────────────┐
║  REGISTERED  ║ --> │EMAIL_VERIFIED│ --> │PROFILE_COMPLETE│
╚══════════════╝     └──────────────┘     └────────────────┘
   (current)                ↓                      ↓
                    ┌──────────────┐      ┌─────────────────┐
                    │   SUSPENDED  │      │IDENTITY_VERIFIED│
                    └──────────────┘      └─────────────────┘
                                                   ↓
                                             ╔══════════╗
                                             ║  ACTIVE  ║
                                             ╚══════════╝
```

**[🚀 Explore All Examples](https://github.com/tung-dnt/nestjs-serverless-workflow/tree/main/examples)**

### How It Works

When you configure SQS integration:

1. The workflow engine will connect to the specified SQS queue
2. It will subscribe to the topics you've defined in the `events` array
3. When a message arrives on a subscribed topic, the workflow engine will:
   - Map the topic to the corresponding workflow event
   - Extract the entity URN from the message
   - Load the entity using your defined `entity.load` function
   - Emit the mapped workflow event with the Kafka message as payload

### Complete Example with SQS Integration

## Using Subpath Exports

The package uses modern subpath exports for better tree-shaking. Import only what you need:

```typescript
import { WorkflowModule } from 'nestjs-serverless-workflow/workflow';
import { IBrokerPublisher } from 'nestjs-serverless-workflow/event-bus';
import { LambdaEventHandler } from 'nestjs-serverless-workflow/adapter';
import { UnretriableException } from 'nestjs-serverless-workflow/exception';
```

This ensures that your bundle only includes the parts of the library you actually use, resulting in smaller bundle sizes.

## Quick Start

````typescript
import { Module } from '@nestjs/common';
import { WorkflowModule, Workflow, OnEvent, Payload, Entity } from 'nestjs-serverless-workflow/workflow';
import { OrderEntityService } from './order-entity.service';


// Define your entity and state/event enums
export enum OrderEvent {
  Create = 'order.create',
  Submit = 'order.submit',
  Complete = 'order.complete',
  Fail = 'order.fail',
}

export enum OrderStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

export class Order {
  id: string;
  name: string;
  price: number;
  items: string[];
  status: OrderStatus;
}
@Workflow({
    states: {
      finals: [OrderStatus.Completed, OrderStatus.Failed],
      idles: [OrderStatus.Pending, OrderStatus.Processing, OrderStatus.Completed, OrderStatus.Failed],
      failed: OrderStatus.Failed,
    },
    transitions: [
      // Your transitions here
      {
        from: OrderStatus.Pending,
        to: OrderStatus.Processing,
        event: OrderEvent.Submit,
        conditions: [(entity: Order, payload: any) => entity.price > 10],
      },
      {
        from: OrderStatus.Processing,
        to: OrderStatus.Completed,
        event: OrderEvent.Complete,
      },
      {
        from: OrderStatus.Processing,
        to: OrderStatus.Failed,
        event: OrderEvent.Fail,
      }
    ],
  };
})
class OrderWorkflowDefinition {
  @OnEvent(OrderEvent.Submit)
  async onSubmit(@Entity entity: Order, @Payload(YourClassValidatorDto) submitData): Promise<Order> {
    // Custom logic on submit event
  }
}

@Module({
  imports: [
    WorkflowModule.register({
      providers: [
        {
          provide: OrderWorkflowDefinition,
          useFactory: (orderEntityService: OrderEntityService, eventEmitter: EventEmitter2) => {
            return new OrderWorkflowDefinition(orderEntityService, eventEmitter);
          },
          inject: [OrderEntityService, EventEmitter2]
        }
      ]
    }),
  ],
})
export class AppModule {}
```

### Message Format

The Kafka messages should include the entity URN so that the workflow engine can load the correct entity. For example:

```json
{
  "urn": "order-123",
  "price": 150,
  "items": ["Item 1", "Item 2"]
}
```

With this setup, your workflow will automatically react to Kafka messages and trigger the appropriate state transitions based on your workflow definition.

### Benefits of Using EntityService

Using a dedicated EntityService provides several advantages:

1. **Separation of Concerns**: Keep entity management logic separate from workflow definitions
2. **Dependency Injection**: Leverage NestJS dependency injection for your entity operations
3. **Reusability**: Use the same EntityService across multiple workflows
4. **Testability**: Easier to mock and test your entity operations
5. **Database Integration**: Cleanly integrate with your database through repositories

This approach is particularly useful for complex applications where entities are stored in databases and require sophisticated loading and persistence logic.`
