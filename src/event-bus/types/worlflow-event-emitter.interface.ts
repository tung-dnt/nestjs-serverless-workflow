import { WorkflowEvent } from './workflow-event.interface';

export interface WorkflowEventEmitter {
  emit<T>(topic: string, payload: WorkflowEvent): Promise<void>;
}
