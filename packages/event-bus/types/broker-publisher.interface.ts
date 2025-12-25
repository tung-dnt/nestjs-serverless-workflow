import { type IWorkflowEvent } from './workflow-event.interface';

export interface IBrokerPublisher {
  emit(event: IWorkflowEvent): Promise<void>;
}
