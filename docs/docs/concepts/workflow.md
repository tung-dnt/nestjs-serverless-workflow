# Workflow

The workflow module provides decorator-based state machine definitions for NestJS applications.

## Core Concepts

### States

States represent the stages your entity moves through. Every workflow defines three kinds:

- **finals** — terminal states where the workflow ends
- **idles** — states where the workflow pauses, waiting for an external event
- **failed** — the failure state to transition to on unhandled errors

```typescript
states: {
  finals: [OrderStatus.Completed, OrderStatus.Failed],
  idles: [OrderStatus.Pending],
  failed: OrderStatus.Failed,
}
```

### Transitions

Transitions define how entities move between states in response to events:

```typescript
{
  event: 'order.submit',
  from: [OrderStatus.Pending],
  to: OrderStatus.Processing,
}
```

### Conditional Transitions

Add condition functions to control when a transition is allowed. All conditions must return `true`:

```typescript
{
  event: 'order.submit',
  from: [OrderStatus.Pending],
  to: OrderStatus.Processing,
  conditions: [
    (entity: Order, payload: any) => entity.items.length > 0,
    (entity: Order, payload: any) => entity.totalAmount > 0,
  ],
}
```

### Events

Events trigger state transitions. Define handlers with the `@OnEvent` decorator:

```typescript
@OnEvent('order.submit')
async onSubmit(@Entity() entity: Order, @Payload() data: SubmitOrderDto) {
  entity.submittedAt = new Date();
  return entity;
}
```

## Decorators

### `@Workflow(config)`

Marks a class as a workflow definition:

```typescript
@Workflow({
  name: 'OrderWorkflow',
  states: { finals: [...], idles: [...], failed: ... },
  transitions: [...],
  entityService: 'entity.order',
  brokerPublisher: 'broker.order', // optional
})
export class OrderWorkflow {}
```

### `@OnEvent(eventName)`

Defines a handler for a specific event.

### `@OnDefault`

Fallback handler for events that don't match any `@OnEvent`:

```typescript
@OnDefault
async fallback(entity: Order, event: string, payload?: any) {
  console.warn(`Unhandled event: ${event}`);
  return entity;
}
```

### `@Entity()`

Injects the entity being processed into the handler.

### `@Payload(DtoClass?)`

Injects the event payload. Optionally pass a DTO class for validation:

```typescript
@OnEvent('order.submit')
async onSubmit(@Entity() entity: Order, @Payload(SubmitOrderDto) data: SubmitOrderDto) {
  // data is validated and transformed
}
```

### `@WithRetry(config)`

Adds retry logic to a handler:

```typescript
@OnEvent('order.payment')
@WithRetry({ maxAttempts: 3, backoff: 'exponential' })
async processPayment(@Entity() entity: Order) {
  // Retries up to 3 times with exponential backoff
}
```

## Entity Service Interface

Implement `IWorkflowEntity` to integrate with your data layer:

```typescript
export interface IWorkflowEntity<T = any, State = string | number> {
  create(): Promise<T>;
  load(urn: string | number): Promise<T | null>;
  update(entity: T, status: State): Promise<T>;
  status(entity: T): State;
  urn(entity: T): string | number;
}
```

## Module Registration

```typescript
WorkflowModule.register({
  imports: [DatabaseModule],
  entities: [
    { provide: 'entity.order', useClass: OrderEntityService },
  ],
  workflows: [OrderWorkflow, UserWorkflow],
})
```

## Error Handling

Use `UnretriableException` for errors that should not be retried:

```typescript
import { UnretriableException } from 'nestjs-serverless-workflow/exception';

@OnEvent('order.validate')
async validate(@Entity() entity: Order) {
  if (entity.totalAmount < 0) {
    throw new UnretriableException('Order amount cannot be negative');
  }
}
```

See the [Decorators API reference](../api-reference/decorators) for full `@WithRetry` configuration.

## Best Practices

1. **Keep workflows stateless** — store state in your entities, not in workflow classes
2. **Use idempotent handlers** — events may be processed multiple times
3. **Handle errors gracefully** — use try-catch and proper error types
4. **Validate payloads** — use DTOs with class-validator
5. **Test thoroughly** — use the [MockDurableContext](./adapters#testing-with-mockdurablecontext) for integration tests
