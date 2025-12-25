# Services

Core services provided by the workflow module.

## OrchestratorService

The main service responsible for orchestrating workflow execution and state transitions.

### Import

```typescript
import { OrchestratorService } from 'nestjs-serverless-workflow/core';
```

### Methods

#### `transit(event)`

Processes a workflow event and executes the appropriate state transition.

##### Signature

```typescript
async transit(params: IWorkflowEvent): Promise<void>
```

##### Parameters

- `params`: Workflow event object:
  - `topic`: Event topic/name
  - `urn`: Unique resource name (entity identifier)
  - `payload?`: Optional event payload
  - `attempt`: Retry attempt number

##### Returns

Promise that resolves when the transition is complete.

##### Example

```typescript
@Injectable()
export class OrderService {
  constructor(private orchestrator: OrchestratorService) {}

  async processOrderEvent(orderId: string, event: string, data: any) {
    await this.orchestrator.transit({
      topic: event,
      urn: orderId,
      payload: data,
      attempt: 0,
    });
  }
}
```

##### Behavior

1. Loads the entity using the URN
2. Finds the appropriate transition based on current state and event
3. Validates transition conditions
4. Executes the event handler
5. Updates entity state
6. Handles retries if configured
7. Processes automatic transitions if applicable

##### Error Handling

- Throws `BadRequestException` if no workflow is found for the event
- Throws `BadRequestException` if no valid transition is found
- Updates entity to failed state on error
- Respects `UnretriableException` to prevent retries

### Lifecycle

The service initializes routes on module initialization (`onModuleInit`):

1. Discovers all workflow classes
2. Extracts workflow definitions and handlers
3. Resolves entity services and broker publishers
4. Builds route map for event handling

## StateRouterHelperFactory

Factory for creating router helpers that assist with state routing logic.

### Import

```typescript
import { StateRouterHelperFactory } from 'nestjs-serverless-workflow/core';
```

### Methods

#### `create(event, entityService, definition, logger)`

Creates a new router helper instance.

##### Signature

```typescript
create(
  event: string,
  entityService: IWorkflowEntity,
  definition: IWorkflowDefinition,
  logger: Logger
): StateRouterHelper
```

## RouterService

Service responsible for routing workflow events to appropriate handlers.

### Note

This service is used internally by `OrchestratorService` and typically doesn't need to be used directly.

## SagaService

Service for managing distributed transactions using the Saga pattern.

### Note

Saga support is planned for future releases. See the workflow definition interface for saga configuration options.

## Usage Example

```typescript
import { Module, Injectable } from '@nestjs/common';
import { WorkflowModule, OrchestratorService } from 'nestjs-serverless-workflow/core';
import { IWorkflowEvent } from 'nestjs-serverless-workflow/event-bus';

@Injectable()
export class WorkflowProcessor {
  constructor(private orchestrator: OrchestratorService) {}

  async processEvent(event: IWorkflowEvent) {
    try {
      await this.orchestrator.transit(event);
      console.log('Event processed successfully');
    } catch (error) {
      console.error('Failed to process event:', error);
      throw error;
    }
  }
}

@Module({
  imports: [
    WorkflowModule.register({
      entities: [],
      workflows: [],
      brokers: [],
    }),
  ],
  providers: [WorkflowProcessor],
})
export class AppModule {}
```

## Related

- [Workflow Module](./workflow-module)
- [Decorators](./decorators)
- [Interfaces](./interfaces)

