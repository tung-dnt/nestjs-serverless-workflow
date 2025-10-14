import { WorkflowEvent } from './workflow-event.interface';

export const BROKER_PUBLISHER = Symbol('BROKER_PUBLISHER');

export interface BrokerPublisher {
  emit(event: WorkflowEvent): Promise<void>;
  retry(event: WorkflowEvent, maxAttempt: number): Promise<void>;
}
