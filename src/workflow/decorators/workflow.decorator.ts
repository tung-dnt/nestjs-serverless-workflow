import { WorkflowDefinition } from '@/workflow/types/workflow-definition.interface';
import { IWorkflowHandler } from '../types/handler-store.interface';

export const WORKFLOW_HANDLER_KEY = 'workflow:metadata';
export const WORKFLOW_DEFINITION_KEY = 'workflow:definition';

export function Workflow<T, Event, State>(definition: WorkflowDefinition<T, Event, State>) {
  return function <T extends { new (...args: any[]): {} }>(instance: T) {
    // Get existing handler store if it exists (from @OnEvent decorators)
    const existingHandlerStore: IWorkflowHandler[] = Reflect.getMetadata(WORKFLOW_HANDLER_KEY, instance) || [];
    
    Reflect.defineMetadata(WORKFLOW_DEFINITION_KEY, definition, instance);
    Reflect.defineMetadata(WORKFLOW_HANDLER_KEY, existingHandlerStore, instance);

    return instance;
  };
}
