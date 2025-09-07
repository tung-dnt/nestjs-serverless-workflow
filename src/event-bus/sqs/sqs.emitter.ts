import { BrokerPublisher } from '../types/worlflow-event-emitter.interface';

export class SqsEmitter implements BrokerPublisher {
  async emit<T>(topic: string, payload: any): Promise<void> {}
}
