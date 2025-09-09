import { BrokerPublisher } from '@/event-bus/types/worlflow-event-emitter.interface';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IEntity } from './entity.interface';

export interface WorkflowController<T, State> {
  entityService: IEntity<T, State>;
  // TODO: combine `brokerPublisher` and `eventEmitter`
  brokerPublisher: BrokerPublisher;
  eventEmitter: EventEmitter2;
  logger: Logger;
}
