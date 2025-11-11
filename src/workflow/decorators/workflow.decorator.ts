import { IWorkflowDefinition } from '@/workflow';

export const WORKFLOW_DEFINITION_KEY = 'workflow:definition';

export function Workflow<T, Event, State>(definition: IWorkflowDefinition<T, Event, State>) {
  return function <T extends { new (...args: any[]): {} }>(instance: T) {
    Reflect.defineMetadata(WORKFLOW_DEFINITION_KEY, definition, instance);

    return instance;
  };
}
