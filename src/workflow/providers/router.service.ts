import { BadRequestException, Logger } from '@nestjs/common';
import { IWorkflowEntity, ITransitionEvent, IWorkflowDefinition } from '../types';

export class RouterService<T, Event, State> {
  constructor(
    private readonly event: Event,
    private readonly entityService: IWorkflowEntity,
    private readonly workflowDefinition: IWorkflowDefinition<T, Event, State>,
    private readonly logger: Logger,
  ) {}

  async loadAndValidateEntity(urn: string | number): Promise<T> {
    const entity = await this.entityService.load(urn);
    if (!entity) {
      this.logger.error(`Element not found`, urn);
      throw new BadRequestException(`Entity not found`, String(urn));
    }

    const entityStatus = this.entityService.status(entity);
    const definedFinalStates = this.workflowDefinition.states.finals as Array<string | number>;

    if (definedFinalStates.includes(entityStatus)) {
      this.logger.warn(`Entity: ${urn} is in a final status. Accepting transitions due to a retry mechanism.`, urn);
    }

    return entity;
  }

  findValidTransition<P>(
    entity: T,
    payload: P,
    options?: { skipEventCheck?: boolean },
  ): ITransitionEvent<T, Event, State> | null {
    const currentStatus = this.entityService.status(entity);
    const possibleNextTransitionSet = new Set<State>();

    const possibleTransitions = this.workflowDefinition.transitions
      // Find transition event that matches the current event and state
      .filter((transition) => {
        const events = Array.isArray(transition.event) ? transition.event : [transition.event];
        const states = (Array.isArray(transition.from) ? transition.from : [transition.from]) as Array<string | number>;
        return (options?.skipEventCheck ? true : events.includes(this.event)) && states.includes(currentStatus);
      })
      // Condition checking
      .filter(({ conditions, to }) => {
        if (conditions && conditions.some((condition) => !condition(entity, payload))) return false;

        possibleNextTransitionSet.add(to);
        return true;
      });

    if (possibleTransitions.length === 0) return null;

    const possibleNextTransitions = Array.from(possibleNextTransitionSet);
    if (possibleNextTransitions.length > 1) {
      throw new BadRequestException(
        `Multiple "to" transition states is not allowed, please verify Workflow Definition at @Workflow decorator: [${possibleNextTransitions.join(', ')}]`,
      );
    }

    // Since event and "to" transition state will be similar
    return possibleTransitions[0];
  }

  isInIdleStatus(entity: T): boolean {
    const status = this.entityService.status(entity);
    if (!status) {
      throw new Error('Entity status is not defined. Unable to determine if the entity is idle or not.');
    }
    const definedIdleStatuses = this.workflowDefinition.states.idles as Array<string | number>;
    return definedIdleStatuses.includes(status);
  }

  buildParamDecorators(entity: T, payload: any, target: any, propertyKey: string | symbol) {
    // Metadata is stored on the prototype when decorators are applied
    const prototype = target.constructor?.prototype || target;
    const paramsMeta: Array<{ index: number; type: string; dto?: any }> =
      Reflect.getOwnMetadata('workflow:params', prototype, propertyKey) || [];

    let args: any[] = [];
    if (paramsMeta && paramsMeta.length > 0) {
      // populate args according to metadata indices
      for (const meta of paramsMeta) {
        if (meta.type === 'entity') args[meta.index] = entity;
        else if (meta.type === 'payload') args[meta.index] = payload;
        else args[meta.index] = undefined;
      }
    } else {
      // legacy: single object param { entity, payload }
      args = [{ entity, payload }];
    }
    return args;
  }
}
