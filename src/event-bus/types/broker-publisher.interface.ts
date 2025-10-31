import { IWorkflowEvent } from './workflow-event.interface';

export const BROKER_PUBLISHER = Symbol('BROKER_PUBLISHER');

export interface IBrokerPublisher {
  emit(event: IWorkflowEvent): Promise<void>;
  retry(event: IWorkflowEvent, maxAttempt: number): Promise<void>;
}
