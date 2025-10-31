import { IWorkflowEvent } from './workflow-event.interface';

export interface IBrokerPublisher {
  emit(event: IWorkflowEvent): Promise<void>;
  retry(event: IWorkflowEvent, maxAttempt: number): Promise<void>;
}
