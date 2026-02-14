import { Injectable, type Logger } from '@nestjs/common';
import type { IWorkflowDefinition, IWorkflowEntity } from '../types';
import { RouterService } from './router.service';

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
