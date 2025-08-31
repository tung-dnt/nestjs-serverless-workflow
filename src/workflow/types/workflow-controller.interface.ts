import { WorkflowEventEmitter } from '@event-bus/types/worlflow-event-emitter.interface';
import { EntityService } from '@workflow/entity.service';

export interface WorkflowController<T, State> {
  entityService: EntityService<T, State>;
  eventEmitter: WorkflowEventEmitter;
}
