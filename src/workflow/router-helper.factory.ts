import { Injectable, Logger } from '@nestjs/common';
import { StateRouterHelper } from './router.helper';
import { IEntity, WorkflowDefinition } from './types';

@Injectable()
export class StateRouterHelperFactory {
  create<T, Event, State>(
    event: Event,
    entityService: IEntity,
    workflowDefinition: WorkflowDefinition<T, Event, State>,
    logger: Logger,
  ): StateRouterHelper<T, Event, State> {
    return new StateRouterHelper(event, entityService, workflowDefinition, logger);
  }
}
