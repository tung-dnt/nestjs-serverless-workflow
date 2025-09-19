import { BrokerPublisher } from '../types/broker-publisher.interface';

export class SqsEmitter implements BrokerPublisher {
  async emit<T>(payload: any): Promise<void> {}
}
