import { WorkflowEvent } from './workflow-event.interface';

export interface BrokerPublisher {
  emit<T>(topic: string, payload: WorkflowEvent): Promise<void>;
}
