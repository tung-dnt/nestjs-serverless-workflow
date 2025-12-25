# Workflow Module

The workflow module provides state machine capabilities for your NestJS applications.

## Installation

```typescript
import { WorkflowModule } from 'serverless-workflow/workflow';
```

## Core Concepts

### States

States represent the different stages your entity can be in during its lifecycle.

```typescript
export enum OrderStatus {
  Draft = 'draft',
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}
```

### Transitions

Transitions define how entities move from one state to another.

```typescript
{
  from: OrderStatus.Pending,
  to: OrderStatus.Processing,
  event: 'order.submit',
  conditions: [
    (entity: Order, payload: any) => entity.items.length > 0,
    (entity: Order, payload: any) => entity.totalAmount > 0,
  ],
  actions: [
    async (entity: Order, payload: any) => {
      // Perform actions during transition
      await notifyWarehouse(entity);
    },
  ],
}
```

### Events

Events trigger state transitions. Define event handlers using the `@OnEvent` decorator:

```typescript
@OnEvent('order.submit')
async onSubmit(@Entity entity: Order, @Payload() data: SubmitOrderDto) {
  // Validate and process the order
  entity.submittedAt = new Date();
  return entity;
}
```

## Workflow Configuration

### Basic Configuration

```typescript
@Workflow({
  states: {
    finals: [OrderStatus.Completed, OrderStatus.Failed],
    idles: [OrderStatus.Draft, OrderStatus.Pending],
    failed: OrderStatus.Failed,
  },
  transitions: [
    // Define your transitions here
  ],
})
export class OrderWorkflow {
  // Event handlers
}
```

### State Types

- **finals**: Terminal states where the workflow ends
- **idles**: States where the workflow waits for external events
- **failed**: The failure state to transition to on errors

### Conditional Transitions

Add conditions to control when transitions can occur:

```typescript
{
  from: OrderStatus.Pending,
  to: OrderStatus.Processing,
  event: 'order.submit',
  conditions: [
    (entity: Order, payload: any) => entity.price > 10,
    (entity: Order, payload: any) => entity.inventory.available,
  ],
}
```

All conditions must return `true` for the transition to proceed.

### Transition Actions

Execute custom logic during state transitions:

```typescript
{
  from: OrderStatus.Processing,
  to: OrderStatus.Completed,
  event: 'order.complete',
  actions: [
    async (entity: Order, payload: any) => {
      await emailService.sendConfirmation(entity);
    },
    async (entity: Order, payload: any) => {
      await inventoryService.decrementStock(entity.items);
    },
  ],
}
```

## Decorators

### `@Workflow(config)`

Marks a class as a workflow definition.

### `@OnEvent(eventName)`

Defines an event handler for the specified event.

### `@Entity`

Injects the entity being processed into the handler.

### `@Payload()`

Injects the event payload. Optionally, pass a DTO class for validation:

```typescript
@OnEvent('order.submit')
async onSubmit(@Entity entity: Order, @Payload(SubmitOrderDto) data: SubmitOrderDto) {
  // data is validated and transformed
}
```

### `@WithRetry(config)`

Adds retry logic to event handlers:

```typescript
@OnEvent('order.payment')
@WithRetry({ maxAttempts: 3, backoff: 'exponential' })
async processPayment(@Entity entity: Order) {
  // Will retry up to 3 times with exponential backoff
}
```

## Entity Service Interface

Implement the `IWorkflowEntity` interface to integrate with your data layer:

```typescript
export interface IWorkflowEntity<T = any> {
  load(urn: string): Promise<T | null>;
  save(entity: T): Promise<T>;
  getStatus(entity: T): string;
  setStatus(entity: T, status: string): T;
  getUrn(entity: T): string;
}
```

## Module Registration

```typescript
WorkflowModule.register({
  imports: [DatabaseModule],
  entities: [OrderEntityService, UserEntityService],
  workflows: [OrderWorkflow, UserWorkflow],
  brokers: [SqsEmitter],
  providers: [CustomService],
})
```

## Orchestrator Service

The `OrchestratorService` handles workflow execution:

```typescript
import { OrchestratorService } from 'serverless-workflow/workflow';

@Injectable()
export class MyService {
  constructor(private orchestrator: OrchestratorService) {}

  async processEvent(event: IWorkflowEvent) {
    await this.orchestrator.transit(event);
  }
}
```

## Error Handling

### Unretriable Errors

Use `UnretriableException` for errors that should not be retried:

```typescript
import { UnretriableException } from 'serverless-workflow/exception';

@OnEvent('order.validate')
async validate(@Entity entity: Order) {
  if (entity.totalAmount < 0) {
    throw new UnretriableException('Order amount cannot be negative');
  }
}
```

### Retry Configuration

Configure retry behavior at the handler level:

```typescript
@OnEvent('order.payment')
@WithRetry({
  maxAttempts: 5,
  backoff: 'exponential',
  initialDelay: 1000,
  maxDelay: 30000,
})
async processPayment(@Entity entity: Order) {
  // This will retry with exponential backoff
}
```

## Best Practices

1. **Keep workflows stateless**: Store state in your entities, not in workflow classes
2. **Use idempotent handlers**: Events may be processed multiple times
3. **Handle errors gracefully**: Use try-catch blocks and proper error types
4. **Validate payloads**: Use DTOs with class-validator for payload validation
5. **Test thoroughly**: Use the testing utilities to test your workflows in isolation

## Examples

See the [examples directory](../examples/) for complete working examples:

- [Order Processing](../examples/order/)
- [DynamoDB Integration](../examples/dynamodb/)
- [Usage Examples](../examples/usage/)

