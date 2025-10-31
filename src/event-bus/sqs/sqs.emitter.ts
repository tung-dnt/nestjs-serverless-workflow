import { IBrokerPublisher } from '../types/broker-publisher.interface';
import { IWorkflowEvent } from '../types/workflow-event.interface';

export class SqsEmitter implements IBrokerPublisher {
  async emit<T>(payload: IWorkflowEvent): Promise<void> {}
  async retry<T>(event: IWorkflowEvent, maxAttempt: number): Promise<void> {}
}
