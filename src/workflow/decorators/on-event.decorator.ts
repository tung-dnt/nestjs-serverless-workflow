import { BadRequestException } from '@nestjs/common';
import { OnEvent as OnEventListener } from '@nestjs/event-emitter';
import { TransitionEvent } from '@workflow/types/transition-event.interface';
import { WorkflowController } from '@workflow/types/workflow-controller.interface';
import { WorkflowDefinition } from '@workflow/types/workflow-definition.interface';

/**
 * 1) Fetch Entity state
 * 2) Check if transition is valid
 * 3) Execute action
 * 4) Update entity state
 * 5) Emit event
 * 6) Handle errors and retries
 * 7) Log the transition
 * 8) Emit event for next step
 *
 * NOTE: tracking for runtime timeout event to resume workflow from interupting
 */
// TODO:
// 1. Handle concurrent update of the same entity - race condition
// 2. Handle workflow session recovery from failed states
// 3. Task schedule -> WAIT methods
export const OnEvent =
  <T, P, State = string>(event: string) =>
  (target: WorkflowController<T, State>, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const workflowDefinition: WorkflowDefinition<T, P, string, State> = Reflect.getMetadata(
      'workflow:definition',
      target.constructor,
    );

    async function loadAndValidateEntity(urn: string | number): Promise<T> {
      const entity = await target.entityService.load(urn);

      if (!entity) {
        target.logger.error(`Element not found`, urn);
        throw new BadRequestException(`Entity not found`, String(urn));
      }

      const entityStatus = target.entityService.status(entity);
      if (workflowDefinition.states.finals.includes(entityStatus)) {
        target.logger.warn(`Entity: ${urn} is in a final status. Accepting transitions due to a retry mechanism.`, urn);
      }

      return entity;
    }

    function findValidTransition(entity: T, payload: P): TransitionEvent<T, P, string, State> | null {
      const currentStatus = target.entityService.status(entity);
      const urn = target.entityService.urn(entity);
      const possibleNextTransitionSet = new Set<State>();

      const possibleTransitions = workflowDefinition.transitions
        // Find transition event that matches the current event and state
        .filter((transition) => {
          const events = Array.isArray(transition.event) ? transition.event : [transition.event];
          const states = Array.isArray(transition.from) ? transition.from : [transition.from];
          return events.includes(event) && states.includes(currentStatus);
        })
        // Condition checking
        .filter(({ conditions, to }) => {
          possibleNextTransitionSet.add(to);
          if (!conditions) return true;
          return conditions.every((condition) => condition(entity, payload));
        });

      if (possibleTransitions.length === 0) {
        target.logger.warn(`There's no valid transition from ${currentStatus} or the condition is not met.`, urn);
        return null;
      }

      const possibleNextTransitions = Array.from(possibleNextTransitionSet);
      if (possibleNextTransitions.length > 1) {
        throw new BadRequestException(
          `Multiple "to" transition states is not allowed, please verify Workflow Definition at @Workflow decorator: [${possibleNextTransitions.join(', ')}]`,
        );
      }

      // Since event and "to" transition state will be similar
      return possibleTransitions[0];
    }

    function isInIdleStatus(entity: T): boolean {
      const status = target.entityService.status(entity);
      if (!status) {
        throw new Error('Entity status is not defined. Unable to determine if the entity is idle or not.');
      }
      return workflowDefinition.states.idles.includes(status);
    }

    descriptor.value = async function (params: { urn: string | number; payload: P }) {
      const { urn, payload } = params;
      target.logger.log(`Method ${propertyKey} is being called with arguments:`, params);

      const entity = await loadAndValidateEntity(urn);
      const entityStatus = target.entityService.status(entity);
      try {
        // Find valid transition
        const transition = await findValidTransition(entity, payload);
        if (!transition) {
          if (workflowDefinition.fallback) {
            target.logger.log(`Falling back to the default transition`, urn);
            await workflowDefinition.fallback(entity, event, payload);
          }
          throw new BadRequestException(
            `No matched transition for event: ${event}, status: ${entityStatus}. Please verify your workflow definition!`,
          );
        }

        if (isInIdleStatus(entity)) {
          // TODO: handle logic for idle status
        }

        target.logger.log(`Executing transition from ${entityStatus} to ${transition.to}`, urn);

        // Process event actions
        let eventActionResult = null;
        try {
          // NOTE: user logic
          eventActionResult = await originalMethod.apply(this, { entity, payload });
        } catch (e) {
          await target.entityService.update(entity, workflowDefinition.states.failed);
          target.logger.log(`Transition failed. Setting status to failed.`, urn);
          throw e;
        }

        // Update entity status
        const updatedEntity = await target.entityService.update(eventActionResult.entity, transition.to);
        target.logger.log(`Element transitioned from ${entityStatus} to ${transition.to}`, urn);

        // Get next event for automatic transitions
        const nextTransition = findValidTransition(updatedEntity, eventActionResult);
        if (!nextTransition) {
          target.logger.warn('This is the last event, no more state transition');
          return;
        }

        const nextEvent = nextTransition.event;
        target.logger.log(
          `Next event: ${event ?? 'none'} Next status: ${target.entityService.status(updatedEntity)}`,
          urn,
        );
        target.eventEmitter.emit(nextEvent, { urn, payload });
      } catch (e) {
        // TODO: add error handler
      }

      // TODO: add runtime timeout calculator
    };
    return OnEventListener(event, { async: true })(target, propertyKey, descriptor);
  };
