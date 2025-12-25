# Interfaces

Core interfaces and types used throughout the workflow library.

## IWorkflowEntity

Interface for entity services that manage workflow entities.

### Signature

```typescript
interface IWorkflowEntity<T = any, State = string | number> {
  create(): Promise<T>;
  load(urn: string | number): Promise<T | null>;
  update(entity: T, status: State): Promise<T>;
  status(entity: T): State;
  urn(entity: T): string | number;
}
```

### Methods

#### `create()`

Creates a new entity instance.

**Returns**: Promise resolving to the new entity.

#### `load(urn)`

Loads an entity by its unique resource name.

**Parameters**:
- `urn`: Unique resource name (entity identifier)

**Returns**: Promise resolving to the entity or null if not found.

#### `update(entity, status)`

Updates an entity's status.

**Parameters**:
- `entity`: The entity to update
- `status`: The new status

**Returns**: Promise resolving to the updated entity.

#### `status(entity)`

Gets the current status of an entity.

**Parameters**:
- `entity`: The entity

**Returns**: The current status.

#### `urn(entity)`

Gets the unique resource name of an entity.

**Parameters**:
- `entity`: The entity

**Returns**: The entity's URN.

### Example

```typescript
@Injectable()
export class OrderEntityService implements IWorkflowEntity<Order, OrderStatus> {
  async create(): Promise<Order> {
    return { id: uuid(), status: OrderStatus.Pending };
  }

  async load(urn: string): Promise<Order | null> {
    return await this.repository.findOne({ where: { id: urn } });
  }

  async update(entity: Order, status: OrderStatus): Promise<Order> {
    entity.status = status;
    return await this.repository.save(entity);
  }

  status(entity: Order): OrderStatus {
    return entity.status;
  }

  urn(entity: Order): string {
    return entity.id;
  }
}
```

## IBrokerPublisher

Interface for broker publishers that emit workflow events.

### Signature

```typescript
interface IBrokerPublisher {
  emit<T>(payload: IWorkflowEvent<T>): Promise<void>;
}
```

### Methods

#### `emit(payload)`

Publishes a workflow event to the message broker.

**Parameters**:
- `payload`: Workflow event to publish

**Returns**: Promise that resolves when the event is published.

### Example

```typescript
@Injectable()
export class SqsEmitter implements IBrokerPublisher {
  async emit<T>(payload: IWorkflowEvent<T>): Promise<void> {
    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
      })
    );
  }
}
```

## IWorkflowEvent

Interface for workflow events.

### Signature

```typescript
interface IWorkflowEvent<T = any> {
  topic: string;        // Event topic/name
  urn: string | number; // Unique resource name (entity identifier)
  payload?: T | object | string; // Optional event data
  attempt: number;      // Retry attempt number
}
```

### Properties

- `topic`: Event topic/name (e.g., 'order.submit')
- `urn`: Unique resource name identifying the entity
- `payload?`: Optional event payload data
- `attempt`: Current retry attempt number (starts at 0)

### Example

```typescript
const event: IWorkflowEvent = {
  topic: 'order.submit',
  urn: 'order-12345',
  payload: {
    items: ['item1', 'item2'],
    total: 150.00,
  },
  attempt: 0,
};
```

## IWorkflowDefinition

Interface for workflow definitions.

### Signature

```typescript
interface IWorkflowDefinition<T, Event, State> {
  name: string;
  states: {
    finals: State[];
    idles: State[];
    failed: State;
  };
  transitions: ITransitionEvent<T, Event, State, any>[];
  conditions?: (<P>(entity: T, payload?: P | T | object | string) => boolean)[];
  onTimeout?: (<P>(entity: T, event: Event, payload?: P | T | object | string) => Promise<any>)[];
  entityService: string;
  brokerPublisher: string;
  saga?: ISagaConfig;
}
```

### Properties

- `name`: Unique workflow name
- `states`: State configuration
  - `finals`: Terminal states
  - `idles`: Idle states (waiting for external events)
  - `failed`: Failure state
- `transitions`: Array of transition definitions
- `conditions?`: Optional global conditions
- `onTimeout?`: Optional timeout callbacks
- `entityService`: Injection token for entity service
- `brokerPublisher`: Injection token for broker publisher
- `saga?`: Optional saga configuration

## ITransitionEvent

Interface for transition event definitions.

### Signature

```typescript
interface ITransitionEvent<T, Event, State = string, P = unknown> {
  event: Event;
  from: State[];
  to: State;
  conditions?: ((entity: T, payload?: P) => boolean)[];
}
```

### Properties

- `event`: Event that triggers the transition
- `from`: Array of source states
- `to`: Target state
- `conditions?`: Optional condition functions (all must return true)

### Example

```typescript
{
  event: 'order.submit',
  from: [OrderStatus.Pending],
  to: OrderStatus.Processing,
  conditions: [
    (entity: Order, payload?: any) => entity.items.length > 0,
    (entity: Order, payload?: any) => entity.totalAmount > 0,
  ],
}
```

## IBackoffRetryConfig

Interface for retry configuration.

### Signature

```typescript
interface IBackoffRetryConfig {
  maxAttempts: number;
  backoff: 'exponential' | 'linear' | 'fixed';
  initialDelay: number;
  maxDelay: number;
  handler?: string; // Optional retry handler injection token
}
```

### Properties

- `maxAttempts`: Maximum number of retry attempts
- `backoff`: Backoff strategy
- `initialDelay`: Initial delay in milliseconds
- `maxDelay`: Maximum delay in milliseconds
- `handler?`: Optional custom retry handler injection token

## Related

- [Workflow Module](./workflow-module)
- [Decorators](./decorators)
- [Services](./services)

