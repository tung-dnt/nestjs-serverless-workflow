import { BrokerPublisher } from '@/event-bus/types/broker-publisher.interface';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IEntity } from './entity.interface';

export interface WorkflowController<T, State> {
  readonly entityService: IEntity<T, State>;
  readonly brokerPublisher: BrokerPublisher;
  readonly eventEmitter: EventEmitter2;
  readonly logger: Logger;
}
