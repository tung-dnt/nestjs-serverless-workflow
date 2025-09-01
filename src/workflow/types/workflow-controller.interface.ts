import { BrokerPublisher } from '@event-bus/types/worlflow-event-emitter.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityService } from '@workflow/entity.service';

export interface WorkflowController<T, State> {
  entityService: EntityService<T, State>;
  brokerPublisher: BrokerPublisher;
  eventEmitter: EventEmitter2;
}
