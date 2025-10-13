import { BrokerPublisher } from '../types/broker-publisher.interface';
import { WorkflowEvent } from '../types/workflow-event.interface';

export class SqsEmitter implements BrokerPublisher {
  async emit<T>(payload: WorkflowEvent): Promise<void> {}
  async retry<T>(event: WorkflowEvent, maxAttempt: number): Promise<void> {}
}
