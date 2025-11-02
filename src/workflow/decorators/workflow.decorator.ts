import { IWorkflowDefinition } from '@/workflow/types/workflow-definition.interface';
import { IWorkflowHandler } from '../types/handler-store.interface';

export const WORKFLOW_HANDLER_KEY = 'workflow:metadata';
export const WORKFLOW_DEFINITION_KEY = 'workflow:definition';
export const WORKFLOW_DEFAULT_EVENT = 'workflow.default';

export function Workflow<T, Event, State>(definition: IWorkflowDefinition<T, Event, State>) {
  return function <T extends { new (...args: any[]): {} }>(instance: T) {
    // Get existing handler store if it exists (from @OnEvent decorators)
    const existingHandlerStore: IWorkflowHandler[] = Reflect.getMetadata(WORKFLOW_HANDLER_KEY, instance) || [];
    // Get existing fallback if it exists
    const existingDefaultHandler = Reflect.getMetadata(WORKFLOW_DEFAULT_EVENT, instance);

    Reflect.defineMetadata(WORKFLOW_DEFINITION_KEY, definition, instance);
    Reflect.defineMetadata(WORKFLOW_HANDLER_KEY, existingHandlerStore, instance);
    Reflect.defineMetadata(WORKFLOW_DEFAULT_EVENT, existingDefaultHandler, instance);

    return instance;
  };
}
