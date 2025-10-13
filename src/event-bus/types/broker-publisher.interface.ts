import { WorkflowEvent } from './workflow-event.interface';

export interface BrokerPublisher {
  emit(event: WorkflowEvent): Promise<void>;
  retry(event: WorkflowEvent, maxAttempt: number): Promise<void>;
}
