import { TransitionEvent } from '@/workflow/types/transition-event.interface';
import { WorkflowController } from '@/workflow/types/workflow-controller.interface';
import { WorkflowDefinition } from '@/workflow/types/workflow-definition.interface';
import { BadRequestException } from '@nestjs/common';
import { OnEvent as OnEventListener } from '@nestjs/event-emitter';

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
// 1. Idempotency key to avoid duplicated event processing (DONE - using SQS FIFO queue)
// 2. Handle workflow session recovery from failed states (PLAN: using SQS message filtering)
// 3. Task schedule -> WAIT methods (PLAN: using SQS message filtering)
// 4. IDLE states handling (PLAN: using SQS message filtering)
// 5. FAILED states handling (PLAN: using SQS message filtering)
// 6. Timeout handling (IN_PROGRESS)
export const OnEvent =
  <T, State = string>(event: string) =>
  (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    // capture the original user method before we replace the descriptor
    const originalMethod = descriptor.value;

    // Replace the method with a wrapper that uses the controller instance (`this`)
    descriptor.value = async function <P>(params: { urn: string | number; payload: P }) {
      // Resolve the actual controller instance at runtime from `this`
      const instance = this as WorkflowController<T, State>;
      // Resolve workflowDefinition at runtime from the concrete instance's constructor.
      // Class decorators (like @Workflow) are applied after method decorators, so reading metadata
      // from `target` at decoration time may return undefined. Using `instance.constructor` ensures
      // we read metadata from the actual class when the handler runs.
      const workflowDefinition: WorkflowDefinition<T, string, State> = Reflect.getMetadata(
        'workflow:definition',
        instance.constructor,
      );
      if (!workflowDefinition) {
        const className = instance?.constructor?.name ?? target?.name ?? 'Unknown';
        throw new Error(
          `Workflow definition metadata is missing for controller class "${className}". Ensure @Workflow(...) is applied to the class and that decorators are not reordered.`,
        );
      }

      async function loadAndValidateEntity(urn: string | number): Promise<T> {
        const entity = await instance.entityService.load(urn);
        if (!entity) {
          instance.logger.error(`Element not found`, urn);
          throw new BadRequestException(`Entity not found`, String(urn));
        }

        const entityStatus = instance.entityService.status(entity);
        if (workflowDefinition.states.finals.includes(entityStatus)) {
          instance.logger.warn(
            `Entity: ${urn} is in a final status. Accepting transitions due to a retry mechanism.`,
            urn,
          );
        }

        return entity;
      }

      function findValidTransition<P>(
        entity: T,
        payload: P,
        options?: { skipEventCheck?: boolean },
      ): TransitionEvent<T, string, State> | null {
        const currentStatus = instance.entityService.status(entity);
        const possibleNextTransitionSet = new Set<State>();

        const possibleTransitions = workflowDefinition.transitions
          // Find transition event that matches the current event and state
          .filter((transition) => {
            const events = Array.isArray(transition.event) ? transition.event : [transition.event];
            const states = Array.isArray(transition.from) ? transition.from : [transition.from];
            return (options?.skipEventCheck ? true : events.includes(event)) && states.includes(currentStatus);
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

      function isInIdleStatus(entity: T): boolean {
        const status = instance.entityService.status(entity);
        if (!status) {
          throw new Error('Entity status is not defined. Unable to determine if the entity is idle or not.');
        }
        return workflowDefinition.states.idles.includes(status);
      }

      // ========================= BEGIN wrapper logic =========================
      const { urn, payload } = params;
      instance.logger.log(`Method ${propertyKey} is being called with arguments:`, params);

      const entity = await loadAndValidateEntity(urn);
      const entityStatus = instance.entityService.status(entity);
      try {
        // Find valid transition
        const transition = findValidTransition(entity, payload);
        if (!transition) {
          if (workflowDefinition.fallback) {
            instance.logger.log(`Falling back to the default transition`, urn);
            await workflowDefinition.fallback(entity, event, payload);
          }
          throw new BadRequestException(
            `No matched transition for event: ${event}, status: ${entityStatus}. Please verify your workflow definition!`,
          );
        }

        if (isInIdleStatus(entity)) {
          // TODO: handle logic for idle status
        }

        instance.logger.log(`Executing transition from ${entityStatus} to ${transition.to}`, urn);

        // Process event actions
        let eventActionResult = null;
        try {
          // Build args for original method based on parameter decorators (if any)
          const paramsMeta: Array<{ index: number; type: string; dto?: any }> =
            Reflect.getOwnMetadata('workflow:params', target, propertyKey) || [];

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

          // NOTE: user logic - call original method with the runtime `this`
          eventActionResult = await originalMethod.apply(this, args);
        } catch (e) {
          await instance.entityService.update(entity, workflowDefinition.states.failed);
          instance.logger.log(`Transition failed. Setting status to failed.`, urn);
          throw e;
        }

        // Update entity status
        const updatedEntity = await instance.entityService.update(entity, transition.to);
        instance.logger.log(`Element transitioned from ${entityStatus} to ${transition.to}`, urn);
        const updatedStatus = instance.entityService.status(updatedEntity);

        if (workflowDefinition.states.finals.includes(updatedStatus)) {
          instance.logger.log(`Element ${urn} reached final state: ${updatedStatus}`);
          return;
        }
        // Get next event for automatic transitions
        const nextTransition = findValidTransition(updatedEntity, eventActionResult, { skipEventCheck: true });
        if (!nextTransition) {
          instance.logger.warn(
            `There's no valid next transition from ${updatedStatus} or the condition is not met.`,
            urn,
          );
          return;
        }

        const nextEvent = nextTransition.event;
        instance.logger.log(
          `Next event: ${event ?? 'none'} Next status: ${instance.entityService.status(updatedEntity)}`,
          urn,
        );
        instance.eventEmitter.emit(nextEvent, { urn, payload });
      } catch (e) {
        // TODO: add error handler
      }

      // TODO: add runtime timeout calculator
    };

    // Register with Nest's event emitter (returns the decorated descriptor)
    return OnEventListener(event, { async: true })(target, propertyKey, descriptor);
  };
