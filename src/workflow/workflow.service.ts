import { BadRequestException, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { EntityService } from './entity.service';
import { TransitionEvent } from './types/transition-event.interface';
import { WorkflowDefinition } from './types/workflow-definition.interface';

@Injectable()
/**
 * A generic workflow service that manages state transitions for entities
 *
 * @typeParam T - The type of the entity being managed
 * @typeParam P - The type of the payload used in transitions
 * @typeParam E - The type of events that can trigger transitions
 * @typeParam S - The type of states the entity can be in
 */
export class WorkflowService<T, P, E, S> implements OnModuleInit {
  private readonly logger = new Logger(WorkflowService.name);
  private readonly actionsOnStatusChanged: Map<
    String,
    {
      action: (params: { entity: T; payload?: P | T | object | string }) => Promise<T>;
      failOnError?: boolean;
    }[]
  > = new Map();
  private readonly actionsOnEvent: Map<
    E,
    ((params: { entity: T; payload?: P | T | object | string }) => Promise<T>)[]
  > = new Map();

  private entityService: EntityService<T, S> | null = null;

  private readonly moduleRef?: ModuleRef;

  constructor(
    private readonly definition: WorkflowDefinition<T, P, E, S>,
    @Optional() injectedEntityService?: EntityService<T, S>,
    @Optional() injectedModuleRef?: ModuleRef,
  ) {
    this.moduleRef = injectedModuleRef;
    this.logger.log(`Initializing workflow: ${this.definition.name}`, this.definition.name);
    this.entityService = injectedEntityService || null;
  }

  async onModuleInit() {
    this.configureActions();
  }

  /**
   * Emits an event to trigger a state transition for an entity
   *
   * @param params - The parameters for the state transition
   * @param params.event - The event triggering the transition
   * @param params.urn - The unique identifier of the entity
   * @param params.payload - Optional payload associated with the transition
   * @returns A promise that resolves to the updated entity after the transition
   */
  public async emit(params: { event: E; urn: string; payload?: T | P | object | string }): Promise<void> {
    const { event, urn, payload } = params;
    await this.transition({ event, urn, payload });
  }

  private async transition(params: { event: E; urn: string; payload?: T | P | object | string }): Promise<void> {
    const { event, urn, payload } = params;
    this.logger.log(`Event: ${event}`, urn);

    try {
      // Load entity and validate
      const entity = await this.loadAndValidateEntity(urn);
      await this.processWorkflow(entity, event, urn, payload);
    } catch (error) {
      throw new Error(`Element: ${urn} Event: ${event} - ${error.message}`);
    }
  }

  private async loadAndValidateEntity(urn: string): Promise<T> {
    const entity = await this.loadEntity(urn);

    if (!entity) {
      this.logger.error(`Element not found`, urn);
      throw new BadRequestException(`Entity not found`, urn);
    }

    const entityStatus = this.getEntityStatus(entity);
    if (this.definition.states.finals.includes(entityStatus)) {
      this.logger.warn(`Entity: ${urn} is in a final status. Accepting transitions due to a retry mechanism.`, urn);
    }

    return entity;
  }

  private async processWorkflow(
    entity: T,
    initialEvent: E,
    urn: string,
    payload?: T | P | object | string,
  ): Promise<void> {
    let currentEvent: E | null = initialEvent;
    let currentEntity = entity;

    while (currentEvent) {
      // Process a single transition step
      const result = await this.processTransitionStep(currentEntity, currentEvent, urn, payload);
      currentEntity = result.entity;

      // Break conditions
      if (result.shouldBreak || this.isInIdleStatus(currentEntity) || this.isInFailedStatus(currentEntity)) {
        return;
      }

      // Get next event for automatic transitions
      currentEvent = this.nextEvent(currentEntity);
      this.logger.log(`Next event: ${currentEvent ?? 'none'} Next status: ${this.getEntityStatus(currentEntity)}`, urn);
    }
  }

  private async processTransitionStep(
    entity: T,
    event: E,
    urn: string,
    payload?: T | P | object | string,
  ): Promise<{ entity: T; shouldBreak: boolean }> {
    const entityStatus = this.getEntityStatus(entity);

    // Find valid transition
    const transition = await this.findValidTransition(entity, event, entityStatus, urn, payload);
    if (!transition) {
      if (this.definition.fallback) {
        this.logger.log(`Falling back to the default transition`, urn);
        return { entity: await this.definition.fallback(entity, event, payload), shouldBreak: true };
      }
      return { entity, shouldBreak: true };
    }

    this.logger.log(`Executing transition from ${entityStatus} to ${transition.to}`, urn);

    // Process event actions
    const eventActionResult = await this.executeEventActions(entity, event, urn, payload);
    if (eventActionResult.failed) {
      const failedEntity = await this.updateEntityStatus(entity, this.definition.states.failed);
      this.logger.log(`Transition failed. Setting status to failed.`, urn);
      return { entity: failedEntity, shouldBreak: true };
    }

    // Update entity status
    let updatedEntity = await this.updateEntityStatus(eventActionResult.entity, transition.to);
    this.logger.log(`Element transitioned from ${entityStatus} to ${transition.to}`, urn);

    // Process status change actions
    const statusChangeResult = await this.executeStatusChangeActions(
      updatedEntity,
      entityStatus,
      transition.to,
      urn,
      payload,
    );

    if (statusChangeResult.failed) {
      const failedEntity = await this.updateEntityStatus(updatedEntity, this.definition.states.failed);
      this.logger.log(`Status change actions failed. Setting status to failed.`, urn);
      return { entity: failedEntity, shouldBreak: true };
    }

    return { entity: statusChangeResult.entity, shouldBreak: false };
  }

  private async findValidTransition(
    entity: T,
    event: E,
    currentStatus: S,
    urn: string,
    payload?: T | P | object | string,
  ): Promise<TransitionEvent<T, P, E, S> | undefined> {
    // Find transition event that matches the current event and state
    const transitionEvent = this.definition.transitions.find((transition) => {
      const events = Array.isArray(transition.event) ? transition.event : [transition.event];
      const states = Array.isArray(transition.from) ? transition.from : [transition.from];
      return events.includes(event) && states.includes(currentStatus);
    });

    if (!transitionEvent) {
      this.logger.error(`Unable to find transition event for Event: ${event} and Status: ${currentStatus}`, urn);
      return undefined;
    }

    const nextStatus = transitionEvent.to;

    // Find all possible transitions for this status change
    const possibleTransitions = this.definition.transitions.filter(
      (t) => (Array.isArray(t.from) ? t.from.includes(currentStatus) : t.from === currentStatus) && t.to === nextStatus,
    );

    this.logger.log(`Possible transitions for ${urn}: ${JSON.stringify(possibleTransitions)}`, urn);

    // Find the first valid transition based on conditions
    for (const t of possibleTransitions) {
      this.logger.log(`Checking conditional transition from ${currentStatus} to ${nextStatus}`, urn);

      if (
        !t.conditions ||
        t.conditions.every((condition) => {
          const result = condition(entity, payload);
          this.logger.log(`Condition ${condition.name || 'anonymous'} result: ${result}`, urn);
          return result;
        })
      ) {
        return t;
      }

      this.logger.log(`Condition not met for transition from ${currentStatus} to ${nextStatus}`, urn);
    }

    this.logger.warn(
      `There's no valid transition from ${currentStatus} to ${nextStatus} or the condition is not met.`,
      urn,
    );

    return undefined;
  }

  private async executeEventActions(
    entity: T,
    event: E,
    urn: string,
    payload?: T | P | object | string,
  ): Promise<{ entity: T; failed: boolean }> {
    if (!this.actionsOnEvent.has(event)) {
      return { entity, failed: false };
    }

    const actions = this.actionsOnEvent.get(event);
    if (!actions || actions.length === 0) {
      return { entity, failed: false };
    }

    this.logger.log(`Executing actions for event ${event}`, urn);
    let updatedEntity = entity;

    try {
      for (const action of actions) {
        this.logger.log(`Executing action ${action.name}`, urn);
        updatedEntity = await action({ entity: updatedEntity, payload });
      }
      return { entity: updatedEntity, failed: false };
    } catch (error) {
      this.logger.error(`Event action failed: ${error.message}`, urn);
      return { entity: updatedEntity, failed: true };
    }
  }

  private async executeStatusChangeActions(
    entity: T,
    fromStatus: S,
    toStatus: S,
    urn: string,
    payload?: T | P | object | string,
  ): Promise<{ entity: T; failed: boolean }> {
    const statusChangeKey = `${fromStatus}-${toStatus}`;

    if (!this.actionsOnStatusChanged.has(statusChangeKey)) {
      return { entity, failed: false };
    }

    const actions = this.actionsOnStatusChanged.get(statusChangeKey);
    if (!actions || actions.length === 0) {
      return { entity, failed: false };
    }

    this.logger.log(`Executing actions for status change from ${fromStatus} to ${toStatus}`, urn);
    let updatedEntity = entity;

    for (const action of actions) {
      this.logger.log(`Executing action ${action.action.name}`, urn);
      try {
        updatedEntity = await action.action({ entity: updatedEntity, payload });
      } catch (error) {
        this.logger.error(`Status change action failed: ${error.message}`, urn);
        if (action.failOnError) {
          return { entity: updatedEntity, failed: true };
        }
      }
    }

    return { entity: updatedEntity, failed: false };
  }

  private nextEvent(entity: T): E | null {
    const status = this.getEntityStatus(entity);
    const nextTransitions = this.definition.transitions.filter(
      (transition) =>
        (Array.isArray(transition.from) ? transition.from.includes(status) : transition.from === status) &&
        transition.to !== this.definition.states.failed,
    );
    if (nextTransitions && nextTransitions.length > 1) {
      for (const transition of nextTransitions) {
        const transitionEvent = this.definition.transitions.find((t) => t.event === transition.event);
        if (transitionEvent) {
          const transitionVector = this.definition.transitions.find((t) => t.to === transitionEvent.to);
          if (transitionVector && transitionVector.conditions) {
            let allConditionsMet = true;

            // Execute each condition separately and log the results
            for (const condition of transition.conditions || []) {
              const conditionResult = condition(entity);
              this.logger.log(`Condition ${condition.name || 'unnamed'} result:`, conditionResult);

              if (!conditionResult) {
                allConditionsMet = false;
                // You can choose to break here or continue evaluating all conditions
                // break;
              }
            }

            if (allConditionsMet) {
              if (Array.isArray(transition.event)) {
                throw new Error('Multiple transition events are not allowed in a non-idle state');
              }
              return transition.event;
            } else {
              this.logger.log(`Conditions not met for transition ${transition.event}`);
            }
          }
        }
      }
    } else {
      if (nextTransitions && nextTransitions.length === 1) {
        if (Array.isArray(nextTransitions[0].event)) {
          throw new Error('Multiple transition events are not allowed in a non-idle state');
        }
        return nextTransitions[0].event;
      }
    }
    return null;
  }

  private isInIdleStatus(entity: T): boolean {
    const status = this.getEntityStatus(entity);
    if (!status) {
      throw new Error('Entity status is not defined. Unable to determine if the entity is idle or not.');
    }

    return this.definition.states.idles.includes(status);
  }

  private isInFailedStatus(entity: T): boolean {
    const status = this.getEntityStatus(entity);
    if (!status) {
      throw new Error('Entity status is not defined. Unable to determine if the entity is idle or not.');
    }

    return status === this.definition.states.failed;
  }

  private configureActions() {
    try {
      if (this.definition.actions && this.moduleRef) {
        for (const action of this.definition.actions) {
          const instance = this.moduleRef.get(action, { strict: false });
          if (instance && Reflect.getMetadata('isWorkflowAction', action)) {
            const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(instance));
            for (const method of methods) {
              const event = Reflect.getMetadata('onEvent', instance, method);
              const statusChanged = Reflect.getMetadata('onStatusChanged', instance, method);

              if (event) {
                const methodParams = Reflect.getMetadata('design:paramtypes', instance, method);

                if (!methodParams || methodParams.length !== 1 || !methodParams[0].name.includes('Object')) {
                  throw new Error(
                    `Action method ${method} must have signature (params: { entity: T, payload?: P | T | object | string })`,
                  );
                }

                this.validateActionMethod(instance, method);

                if (!this.actionsOnEvent.has(event)) {
                  this.actionsOnEvent.set(event, []);
                }
                this.actionsOnEvent.get(event)?.push(instance[method].bind(instance));
              }

              if (statusChanged) {
                const methodParams = Reflect.getMetadata('design:paramtypes', instance, method);
                if (!methodParams || methodParams.length !== 1 || !methodParams[0].name.includes('Object')) {
                  throw new Error(
                    `Action method ${method} must have signature (params: { entity: T, payload?: P | T | object | string })`,
                  );
                }

                const from = Reflect.getMetadata('from', instance, method);
                const to = Reflect.getMetadata('to', instance, method);
                const key = `${from}-${to}`;
                if (!this.actionsOnStatusChanged.has(key)) {
                  this.actionsOnStatusChanged.set(key, []);
                }

                this.actionsOnStatusChanged.get(key)?.push({
                  action: instance[method].bind(instance),
                  failOnError: Reflect.getMetadata('failOnError', instance, method),
                });
              }
            }
          }
        }
      }

      this.logger.log(`Initialized with ${this.actionsOnEvent.size} actions on events`, this.definition.name);
      this.logger.log(
        `Initialized with ${this.actionsOnStatusChanged.size} actions on status changes`,
        this.definition.name,
      );
      this.logger.log(`Initialized with ${this.definition.transitions.length} transitions`, this.definition.name);
      this.logger.log(`Initialized with ${this.definition.conditions?.length} conditions`, this.definition.name);

      this.logger.log('moduleref instance ', this.moduleRef);
    } catch (e) {
      this.logger.error('Error trying to initialize workflow actions', e);
      throw e;
    }
  }

  private validateActionMethod = (instance: any, method: string) => {
    // Create a proxy to intercept the method call
    const originalMethod = instance[method];

    instance[method] = function (...args: any[]) {
      if (args.length !== 1) {
        throw new Error(`Action method ${method} must be called with exactly one parameter`);
      }

      const param = args[0];
      if (!param || typeof param !== 'object') {
        throw new Error(`Action method ${method} parameter must be an object`);
      }

      if (!('entity' in param)) {
        throw new Error(`Action method ${method} parameter must have an 'entity' property`);
      }

      // Optional payload is allowed, no need to validate its presence

      // Call the original method if validation passes
      return originalMethod.apply(this, args);
    };
  };

  private async loadEntity(urn: string): Promise<T | null> {
    if (this.entityService) {
      const e = await this.entityService.load(urn);
      return e ?? null;
    }

    // Check if entity is a class (EntityService) and resolve it using ModuleRef
    if (typeof this.definition.entity === 'function' && this.moduleRef) {
      try {
        const entityServiceInstance = this.moduleRef.get(this.definition.entity, { strict: false });
        if (entityServiceInstance) {
          return await entityServiceInstance.load(urn);
        }
      } catch (error) {
        this.logger.warn(`Could not resolve EntityService from ModuleRef: ${error.message}`);
      }
    }

    // Fallback to inline entity configuration
    if (typeof this.definition.entity === 'object' && 'load' in this.definition.entity) {
      return await (this.definition.entity as { load: (urn: string) => Promise<T> }).load(urn);
    }

    throw new Error(`Unable to load entity: entity service not properly configured`);
  }

  private getEntityStatus(entity: T): S {
    if (this.entityService) {
      return this.entityService.status(entity);
    }

    // Check if entity is a class (EntityService) and resolve it using ModuleRef
    if (typeof this.definition.entity === 'function' && this.moduleRef) {
      try {
        const entityServiceInstance = this.moduleRef.get(this.definition.entity, { strict: false });
        if (entityServiceInstance) {
          return entityServiceInstance.status(entity);
        }
      } catch (error) {
        this.logger.warn(`Could not resolve EntityService from ModuleRef: ${error.message}`);
      }
    }

    // Fallback to inline entity configuration
    return (this.definition.entity as { status: (entity: T) => S }).status(entity);
  }

  private async updateEntityStatus(entity: T, status: S): Promise<T> {
    if (this.entityService) {
      return await this.entityService.update(entity, status);
    }

    // Check if entity is a class (EntityService) and resolve it using ModuleRef
    if (typeof this.definition.entity === 'function' && this.moduleRef) {
      try {
        const entityServiceInstance = this.moduleRef.get(this.definition.entity, { strict: false });
        if (entityServiceInstance) {
          return await entityServiceInstance.update(entity, status);
        }
      } catch (error) {
        this.logger.warn(`Could not resolve EntityService from ModuleRef: ${error.message}`);
      }
    }

    // Fallback to inline entity configuration
    if (typeof this.definition.entity === 'object' && 'update' in this.definition.entity) {
      return await (this.definition.entity as { update: (entity: T, status: S) => Promise<T> }).update(entity, status);
    }

    throw new Error(`Unable to update entity status: entity service not properly configured`);
  }
}
