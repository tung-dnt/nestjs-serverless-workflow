import { Injectable, Logger } from '@nestjs/common';
import { RouterService } from './router.service';
import type { IWorkflowEntity, IWorkflowDefinition } from '../types';

@Injectable()
export class StateRouterHelperFactory {
  create<T, Event, State>(
    event: Event,
    entityService: IWorkflowEntity,
    workflowDefinition: IWorkflowDefinition<T, Event, State>,
    logger: Logger,
  ): RouterService<T, Event, State> {
    return new RouterService(event, entityService, workflowDefinition, logger);
  }
}
