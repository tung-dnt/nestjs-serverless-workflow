# Decorators

Decorators provide a declarative way to define workflows and event handlers.

## @Workflow

Marks a class as a workflow definition.

### Signature

```typescript
@Workflow<T, Event, State>(definition: IWorkflowDefinition<T, Event, State>)
```

### Parameters

- `definition`: Workflow definition object containing:
  - `name`: Unique name for the workflow
  - `states`: State configuration
    - `finals`: Array of final states
    - `idles`: Array of idle states
    - `failed`: Failed state
  - `transitions`: Array of transition definitions
  - `entityService`: Injection token for entity service
  - `brokerPublisher`: Injection token for broker publisher
  - `saga?`: Optional saga configuration

### Example

```typescript
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
  ],
  entityService: 'entity.order',
  brokerPublisher: 'broker.order',
})
export class OrderWorkflow {}
```

## @OnEvent

Defines an event handler for a specific event.

### Signature

```typescript
@OnEvent(event: string)
```

### Parameters

- `event`: The event name that triggers this handler

### Example

```typescript
@OnEvent('order.submit')
async onSubmit(@Entity() entity: Order, @Payload() data: any) {
  // Handle the event
  return entity;
}
```

## @OnDefault

Defines a fallback handler for unhandled events.

### Signature

```typescript
@OnDefault
```

### Example

```typescript
@OnDefault
async fallback(entity: Order, event: string, payload?: any) {
  console.warn(`Unhandled event: ${event}`);
  return entity;
}
```

## @Entity

Injects the entity being processed into the handler method.

### Signature

```typescript
@Entity()
```

### Example

```typescript
@OnEvent('order.submit')
async onSubmit(@Entity() entity: Order) {
  console.log('Processing order:', entity.id);
  return entity;
}
```

## @Payload

Injects the event payload into the handler method. Optionally accepts a DTO class for validation.

### Signature

```typescript
@Payload(dto?: Class)
```

### Parameters

- `dto?`: Optional DTO class for payload validation and transformation

### Example

```typescript
@OnEvent('order.submit')
async onSubmit(
  @Entity() entity: Order,
  @Payload(SubmitOrderDto) data: SubmitOrderDto
) {
  // data is validated and transformed
  return entity;
}
```

## @WithRetry

Adds retry logic to event handlers.

### Signature

```typescript
@WithRetry(config: IBackoffRetryConfig)
```

### Parameters

- `config`: Retry configuration object:
  - `maxAttempts`: Maximum number of retry attempts
  - `backoff`: Backoff strategy ('exponential' | 'linear' | 'fixed')
  - `initialDelay`: Initial delay in milliseconds
  - `maxDelay`: Maximum delay in milliseconds
  - `handler?`: Optional custom retry handler injection token

### Example

```typescript
@OnEvent('order.payment')
@WithRetry({
  maxAttempts: 3,
  backoff: 'exponential',
  initialDelay: 1000,
  maxDelay: 30000,
})
async processPayment(@Entity() entity: Order) {
  // Will retry up to 3 times with exponential backoff
  return entity;
}
```

## Usage Example

```typescript
@Workflow({
  name: 'OrderWorkflow',
  states: {
    finals: [OrderStatus.Completed],
    idles: [OrderStatus.Pending],
    failed: OrderStatus.Failed,
  },
  transitions: [
    {
      from: [OrderStatus.Pending],
      to: OrderStatus.Processing,
      event: 'order.submit',
    },
  ],
  entityService: 'entity.order',
  brokerPublisher: 'broker.order',
})
export class OrderWorkflow {
  @OnEvent('order.submit')
  @WithRetry({ maxAttempts: 3, backoff: 'exponential' })
  async onSubmit(
    @Entity() entity: Order,
    @Payload(SubmitOrderDto) data: SubmitOrderDto
  ) {
    // Process order
    return entity;
  }

  @OnDefault
  async fallback(entity: Order, event: string, payload?: any) {
    console.warn(`Unhandled event: ${event}`);
    return entity;
  }
}
```

## Related

- [Workflow Module](./workflow-module)
- [Services](./services)
- [Interfaces](./interfaces)

