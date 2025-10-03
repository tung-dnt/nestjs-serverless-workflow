# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is **@nestjs-serverless-workflow**, a flexible workflow engine built on top of NestJS framework. It enables developers to create, manage, and execute complex state machines and workflows in Node.js applications with both serverless (AWS Lambda + SQS) and traditional server deployments.

### Key Architecture Principles

- **Stateless Design**: No additional storage requirements - state is maintained within domain entities
- **Event-Driven**: Built on NestJS's EventEmitter2 for flexible workflow triggers
- **Dual Configuration**: Supports both inline function definitions and decorator-based approaches
- **Serverless-First**: Optimized for AWS Lambda with SQS integration but works in traditional servers

## Core Architecture

### Main Components

1. **WorkflowService**: The main orchestration service that handles state transitions
2. **WorkflowDefinition**: Interface defining complete workflow structure (states, transitions, conditions)
3. **Entity Services**: Abstract classes implementing `IEntity<T, State>` for entity management
4. **Workflow Controllers**: Classes decorated with `@Workflow` containing business logic
5. **Event Handlers**: Methods decorated with `@OnEvent` for action handling
6. **Message Brokers**: Integration with SQS/Kafka for event-driven workflows

### Key Directories

- `src/workflow/`: Core workflow engine implementation
- `src/examples/`: Complete working examples (Order workflow with DynamoDB)
- `src/event-bus/`: Message broker abstractions and SQS implementation
- `src/adapter/`: Lambda adapter for serverless deployment
- `test/`: Comprehensive test suite with different workflow patterns

## Common Development Commands

### Development

```bash
# Start development server with hot reload
pnpm run dev

# Start production server
pnpm start

# Build for production (creates webpack bundle for Lambda)
pnpm run build

# Clean build artifacts
pnpm run clean
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage report
pnpm run test:cov

# Run tests in watch mode
pnpm run test:watch

# Debug tests
pnpm run test:debug

# Run specific test file
pnpm test -- simple.workflow.spec.ts
```

### Code Quality

```bash
# Lint TypeScript files
pnpm run lint

# Format code with Prettier
pnpm run format
```

### Serverless Deployment

```bash
# Deploy to AWS (builds and deploys Lambda + SQS)
pnpm run deploy

# Remove serverless stack
pnpm run remove

# View Lambda logs
pnpm run logs
```

## Workflow Implementation Patterns

### 1. Simple Inline Configuration

For basic workflows, use inline functions in the workflow definition:

```typescript
const definition: WorkflowDefinition<Order, OrderEvent, OrderStatus> = {
  states: {
    finals: [OrderStatus.Completed, OrderStatus.Failed],
    idles: [OrderStatus.Pending],
    failed: OrderStatus.Failed,
  },
  transitions: [
    {
      from: OrderStatus.Pending,
      to: OrderStatus.Processing,
      event: OrderEvent.Submit,
      conditions: [(entity, payload) => entity.price > 10],
      actions: [
        async (entity, payload) => {
          entity.processedAt = new Date();
          return entity;
        },
      ],
    },
  ],
};
```

### 2. Decorator-Based Configuration

For complex workflows, use the decorator approach:

```typescript
@Workflow<Order, OrderEvent, OrderState>({
  name: 'OrderWorkflow',
  states: {
    /* ... */
  },
  transitions: [
    /* ... */
  ],
})
export class OrderWorkflow implements WorkflowController<Order, OrderState> {
  @OnEvent<Order, OrderState>(OrderEvent.CREATED)
  async handleOrderCreated(@Entity() order: Order, @Payload() payload: any) {
    // Business logic here
    return { processedAt: new Date().toISOString() };
  }
}
```

## Entity Service Implementation

All workflows require an Entity Service implementing `IEntity<T, State>`:

```typescript
@Injectable()
export class OrderEntityService implements IEntity<Order, OrderState> {
  async create(): Promise<Order> {
    /* Create new entity */
  }
  async load(urn: string): Promise<Order | null> {
    /* Load from storage */
  }
  async update(order: Order, status: OrderState): Promise<Order> {
    /* Persist changes */
  }
  status(order: Order): OrderState {
    return order.status;
  }
  urn(order: Order): string | number {
    return order.id;
  }
}
```

## Testing Patterns

### Basic Workflow Testing

```typescript
describe('Order Workflow', () => {
  let service: WorkflowService<Order, any, OrderEvent, OrderStatus>;

  beforeEach(() => {
    service = new WorkflowService(workflowDefinition);
  });

  it('should transition states correctly', async () => {
    const result = await service.emit({
      event: OrderEvent.Submit,
      urn: 'order-123',
    });
    expect(result.status).toBe(OrderStatus.Processing);
  });
});
```

### NestJS Module Testing

```typescript
const module = await Test.createTestingModule({
  imports: [
    WorkflowModule.register({
      entities: [OrderEntityService],
      workflows: [OrderWorkflow],
      broker: MockBrokerPublisher,
    }),
  ],
}).compile();
```

## Serverless Configuration

The project uses Serverless Framework with the following setup:

- **Runtime**: Node.js 20.x on AWS Lambda
- **Messaging**: FIFO SQS queues for event processing
- **Bundling**: Webpack with SWC for fast compilation
- **Deployment**: Serverless Lift for queue construction

### Key Serverless Files

- `serverless.yml`: Main serverless configuration
- `webpack.config.js`: Lambda bundling configuration
- `src/lambda.ts`: Lambda function entry point
- `src/adapter/lambda.adapter.ts`: SQS event handler

## Message Format

SQS messages should include entity URN for workflow processing:

```json
{
  "urn": "order-123",
  "event": "order.created",
  "payload": {
    "price": 150,
    "items": ["Item 1", "Item 2"]
  }
}
```

## Development Tips

1. **State Management**: Always define clear `finals`, `idles`, and `failed` states
2. **Conditions**: Use condition arrays for complex transition logic
3. **Error Handling**: Implement fallback functions for unmatched transitions
4. **Testing**: Test all transition paths, especially complex multi-state/multi-event scenarios
5. **Entity Loading**: Optimize entity loading strategies for high-volume workflows
6. **Event Ordering**: Use `order` property in `@OnEvent` decorators for execution sequence

## Common Issues & Solutions

1. **Missing Transitions**: Implement `fallback` function to handle undefined transitions
2. **Lambda Timeouts**: Configure appropriate timeout values in `serverless.yml` (default: 15 minutes)
3. **Entity Not Found**: Ensure URN format consistency between workflows and entity services
4. **Complex Conditions**: Break down complex conditions into smaller, testable functions
5. **Auto-Transitions**: Remember that non-idle states trigger automatic progression

## Environment Configuration

- **Node.js**: 20+ required
- **Package Manager**: pnpm (>=10) preferred
- **AWS**: Configure credentials for serverless deployment
- **Dependencies**: All core dependencies are in devDependencies for Lambda optimization

