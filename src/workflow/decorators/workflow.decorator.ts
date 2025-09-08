import { WorkflowDefinition } from '@workflow/types/workflow-definition.interface';

const WORKFLOW_METADATA_KEY = 'workflow:definition';

export function Workflow<T, Event, State>(definition: WorkflowDefinition<T, Event, State>) {
  return function <T extends { new (...args: any[]): {} }>(instance: T) {
    // Define metadata on the constructor (class) so runtime lookups via `instance.constructor`
    // can find it.
    Reflect.defineMetadata(WORKFLOW_METADATA_KEY, definition, instance);

    // Also define metadata on the prototype to cover consumers that read metadata from the
    // prototype (some decorator ordering or reflection patterns may expect this).
    if (instance.prototype) {
      Reflect.defineMetadata(WORKFLOW_METADATA_KEY, definition, instance.prototype);
    }

    return instance;
  };
}
