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
export const OnEvent =
  <T, P, State>(event: string) =>
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

    async function findValidTransition(
      entity: T,
      event: string,
      currentStatus: State,
      urn: string | number,
      payload?: P,
    ): Promise<TransitionEvent<T, P, string, State> | undefined> {
      // Find transition event that matches the current event and state
      const currentTransitionEvent = workflowDefinition.transitions.find((transition) => {
        const events = Array.isArray(transition.event) ? transition.event : [transition.event];
        const states = Array.isArray(transition.from) ? transition.from : [transition.from];
        return events.includes(event) && states.includes(currentStatus);
      });

      if (!currentTransitionEvent) {
        target.logger.error(`Unable to find transition event for Event: ${event} and Status: ${currentStatus}`, urn);
        return undefined;
      }
      const nextStatus = currentTransitionEvent.to;

      // Find all possible transitions for this status change
      const possibleTransitions = workflowDefinition.transitions.filter(
        (t) =>
          (Array.isArray(t.from) ? t.from.includes(currentStatus) : t.from === currentStatus) && t.to === nextStatus,
      );

      target.logger.log(`Possible transitions for ${urn}: ${JSON.stringify(possibleTransitions)}`, urn);

      // Find the first valid transition based on conditions
      for (const t of possibleTransitions) {
        target.logger.log(`Checking conditional transition from ${currentStatus} to ${nextStatus}`, urn);

        if (
          !t.conditions ||
          t.conditions.every((condition) => {
            const result = condition(entity, payload);
            target.logger.log(`Condition ${condition.name || 'anonymous'} result: ${result}`, urn);
            return result;
          })
        ) {
          return t;
        }

        target.logger.log(`Condition not met for transition from ${currentStatus} to ${nextStatus}`, urn);
      }

      target.logger.warn(
        `There's no valid transition from ${currentStatus} to ${nextStatus} or the condition is not met.`,
        urn,
      );

      return undefined;
    }

    // TODO: clarify and adjust for Lambda runtime
    function findNextEvent(entity: T): string | null {
      const status = target.entityService.status(entity);
      const nextTransitions = workflowDefinition.transitions.filter(
        (transition) =>
          (Array.isArray(transition.from) ? transition.from.includes(status) : transition.from === status) &&
          transition.to !== workflowDefinition.states.failed,
      );

      if (nextTransitions && nextTransitions.length > 1) {
        for (const transition of nextTransitions) {
          const transitionEvent = workflowDefinition.transitions.find((t) => t.event === transition.event);

          if (!transitionEvent) continue;

          const transitionVector = workflowDefinition.transitions.find((t) => t.to === transitionEvent.to);
          if (transitionVector && transitionVector.conditions) {
            let allConditionsMet = true;

            for (const condition of transition.conditions || []) {
              // Execute each condition separately and log the results
              const conditionResult = condition(entity);
              target.logger.log(`Condition ${condition.name || 'unnamed'} result:`, conditionResult);

              if (!conditionResult) {
                allConditionsMet = false;
                break;
              }
            }

            if (allConditionsMet) {
              if (Array.isArray(transition.event)) {
                throw new Error('Multiple transition events are not allowed in a non-idle state');
              }
              return transition.event;
            } else {
              target.logger.log(`Conditions not met for transition ${transition.event}`);
            }
          }
        }
      } else {
        if (Array.isArray(nextTransitions[0].event)) {
          if (nextTransitions && nextTransitions.length === 1) {
            throw new Error('Multiple transition events are not allowed in a non-idle state');
          }
          return nextTransitions[0].event;
        }
      }
      return null;
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
        const transition = await findValidTransition(entity, event, entityStatus, urn, payload);
        if (!transition) {
          if (workflowDefinition.fallback) {
            target.logger.log(`Falling back to the default transition`, urn);
            await workflowDefinition.fallback(entity, event, payload);
          }
          throw WorkflowValidationException(
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
        const nextEvent = findNextEvent(updatedEntity);
        if (!nextEvent) {
          target.logger.warn('This is the last event, no more state transition');
          return;
        }
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
