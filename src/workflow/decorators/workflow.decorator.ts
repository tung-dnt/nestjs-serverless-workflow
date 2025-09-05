import { Controller } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkflowDefinition } from '@workflow/types/workflow-definition.interface';
import { WorkflowController } from '@workflow/types/workflow-controller.interface';
import { EntityService } from '@workflow/entity.service';
import { BrokerPublisher } from '@event-bus/types/worlflow-event-emitter.interface';

export function Workflow<T, P, Event, State>(definition: WorkflowDefinition<T, P, Event, State>) {
  return function <TClass extends { new (...args: any[]): {} }>(Base: TClass) {
    @Controller(definition.name || 'workflow')
    class MyWorkflow extends Base implements WorkflowController<T, State> {
      public entityService!: EntityService<T, State>;
      public brokerPublisher!: BrokerPublisher;
      public eventEmitter!: EventEmitter2;

      constructor(...args: any[]) {
        super(...args);
      }
    }
    Reflect.defineMetadata('workflow:definition', definition, MyWorkflow);

    return MyWorkflow;
  };
}

/**
 * Decorator to mark a class as a workflow action provider
 * This decorator adds metadata that allows the workflow service to identify and register action classes
 */
export function WorkflowAction(): ClassDecorator {
  return function <T extends Function>(target: T): T {
    Reflect.defineMetadata('isWorkflowAction', true, target);
    return target;
  };
}
