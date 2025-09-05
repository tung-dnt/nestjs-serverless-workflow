import { BrokerPublisher } from '@event-bus/types/worlflow-event-emitter.interface';
import { Entity } from '@workflow/types/entity.interface';
import { WorkflowController } from '@workflow/types/workflow-controller.interface';
import { WorkflowDefinition } from '@workflow/types/workflow-definition.interface';

export function Workflow<T, P, Event, State>(definition: WorkflowDefinition<T, P, Event, State>) {
  return function <T extends { new (...args: any[]): {} }>(instance: T) {
    class MyWorkflow extends instance implements WorkflowController<T, State> {
      constructor(eventEmitter: BrokerPublisher, entityService: Entity<T, State>, ...args: any[]) {
        super(...(arguments as any));
      }
    }
    Reflect.defineMetadata('workflow:definition', definition, MyWorkflow);

    return MyWorkflow;
  };
}
