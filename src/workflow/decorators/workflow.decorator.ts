import { Controller } from '@nestjs/common';
import { WorkflowDefinition } from '@workflow/types/workflow-definition.interface';
import { WorkflowController } from '@workflow/types/workflow-controller.interface';
import { EntityService } from '@workflow/entity.service';
import { BrokerPublisher } from '@event-bus/types/worlflow-event-emitter.interface';

export function Workflow<T, P, Event, State>(definition: WorkflowDefinition<T, P, Event, State>) {
  return function <T extends { new (...args: any[]): {} }>(instance: T) {
    @Controller(definition.name)
    class MyWorkflow extends instance implements WorkflowController<T, State> {
      constructor(eventEmitter: BrokerPublisher, entityService: EntityService<T, State>, ...args: any[]) {
        super(...(arguments as any));
      }
    }
    Reflect.defineMetadata('workflow:definition', definition, MyWorkflow);

    return MyWorkflow;
  };
}
