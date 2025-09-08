import { WorkflowDefinition } from '@workflow/types/workflow-definition.interface';

export function Workflow<T, Event, State>(definition: WorkflowDefinition<T, Event, State>) {
  return function <T extends { new (...args: any[]): {} }>(instance: T) {
    Reflect.defineMetadata('workflow:definition', definition, instance);
    return instance;
  };
}
