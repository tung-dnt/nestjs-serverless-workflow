import { type IBrokerPublisher } from '../types/broker-publisher.interface';
import { type IWorkflowEvent } from '../types/workflow-event.interface';

export class SqsEmitter implements IBrokerPublisher {
  async emit<T>(_payload: IWorkflowEvent<T>): Promise<void> {}
}
