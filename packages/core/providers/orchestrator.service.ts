import {
  getRetryKey,
  WORKFLOW_DEFAULT_EVENT,
  WORKFLOW_DEFINITION_KEY,
  WORKFLOW_HANDLER_KEY,
  type IBackoffRetryConfig,
  type IWorkflowDefaultRoute,
  type IWorkflowDefinition,
  type IWorkflowEntity,
  type IWorkflowHandler,
  type TDefaultHandler,
  type TransitResult,
} from '@/core';
import { UnretriableException } from '@/exception/unretriable.exception';
import { BadRequestException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, ModuleRef } from '@nestjs/core';
import type { IWorkflowEvent } from '../types/workflow-event.interface';
import { StateRouterHelperFactory } from './router.factory';

/**
 * TODO:
 * 1. Retry Service: Retry in state handler level via `IRetryHandler`
 *   +) Bind configs to lambda retry config
 */
@Injectable()
export class OrchestratorService implements OnModuleInit {
  private routes = new Map<string, IWorkflowDefaultRoute>();
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly routerHelperFactory: StateRouterHelperFactory,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit() {
    const providers = this.discoveryService.getProviders();
    for (const provider of providers) {
      const { instance } = provider;
      if (!instance?.constructor) continue;

      const [workflowDefinition, handlerStore, defaultHandler] = [
        Reflect.getMetadata(WORKFLOW_DEFINITION_KEY, instance.constructor) as IWorkflowDefinition<
          object,
          string,
          string
        >,
        Reflect.getMetadata(WORKFLOW_HANDLER_KEY, instance.constructor) as IWorkflowHandler[],
        Reflect.getMetadata(WORKFLOW_DEFAULT_EVENT, instance.constructor) as TDefaultHandler<object>,
        [],
      ];

      if (!handlerStore || handlerStore.length === 0 || !workflowDefinition) continue;

      const entityService = this.moduleRef.get<IWorkflowEntity>(workflowDefinition.entityService, { strict: true });

      for (const handler of handlerStore) {
        if (this.routes.has(handler.event)) {
          throw new Error(
            `Duplicate workflow event handler detected for event: ${handler.event} in workflow: ${workflowDefinition.name}`,
          );
        }
        // Retrieve retry config from metadata on the handler function (not from DI container)
        const retryConfig = Reflect.getMetadata(getRetryKey(handler.name), handler.handler) as
          | IBackoffRetryConfig
          | undefined;

        this.routes.set(handler.event, {
          handler: handler.handler,
          definition: workflowDefinition,
          instance,
          handlerName: handler.name,
          retryConfig,
          defaultHandler,
          entityService,
        });
      }
    }
    this.logger.log(`StateRouter initialized with ${this.routes.size} routes: `, Array.from(this.routes.keys()));
  }

  async transit(params: IWorkflowEvent): Promise<TransitResult> {
    const { urn, payload, event } = params;

    const route = this.routes.get(event);
    if (!route) throw new BadRequestException(`No workflow found for event: ${event}`);
    const { definition, instance, defaultHandler, entityService, handlerName, handler } = route;

    if (!definition) {
      const className = instance.name;
      throw new BadRequestException(
        `Workflow definition metadata is missing for controller class "${className}". Ensure @Workflow(...) is applied to the class and that decorators are not reordered.`,
      );
    }

    const logger = new Logger(`Router::${definition.name}`);
    const routerHelper = this.routerHelperFactory.create(event, entityService, definition, logger);
    logger.log(`Method ${route.handlerName} is being called with arguments:`, params);

    // ========================= BEGIN routing logic =========================
    let entity = await routerHelper.loadAndValidateEntity(urn);

    const entityStatus = entityService.status(entity);
    const { transition, hasEventStateMatch } = routerHelper.findValidTransition(entity, payload);

    if (!transition) {
      // Idle states: silently wait when a transition exists but conditions aren't met
      if (hasEventStateMatch && routerHelper.isInIdleStatus(entity)) {
        logger.log(`Entity ${urn} is in idle state ${entityStatus}. Conditions not met — waiting for next event.`);
        return { status: 'idle', state: entityStatus };
      }
      if (defaultHandler) {
        logger.log(`Falling back to the default transition`, urn);
        await defaultHandler.call(instance, entity, event, payload);
      }
      throw new BadRequestException(
        `No matched transition for event: ${event}, status: ${entityStatus}. Please verify your workflow definition!`,
      );
    }

    try {
      logger.log('======= WORKFLOW STEP STARTED =======');
      logger.log(`Executing transition from ${entityStatus} to ${transition.to} (${urn})`);

      const args = routerHelper.buildParamDecorators(entity, payload, instance, handlerName);
      const handlerOutput = await handler.apply(instance, args);

      // Update entity status
      entity = await entityService.update(entity, transition.to);
      logger.log(`Element transitioned from ${entityStatus} to ${transition.to} (${urn})`);

      const updatedStatus = entityService.status(entity);

      // Final state — workflow complete
      const definedFinalStates = definition.states.finals as Array<string | number>;
      if (definedFinalStates.includes(updatedStatus)) {
        logger.log(`Element ${urn} reached final state: ${updatedStatus}`);
        return { status: 'final', state: updatedStatus };
      }

      // Idle state — wait for explicit external event
      if (routerHelper.isInIdleStatus(entity)) {
        logger.log(`Element ${urn} reached idle state: ${updatedStatus}. Waiting for explicit event.`);
        return { status: 'idle', state: updatedStatus };
      }

      // Find next valid transition
      const { transition: nextTransition } = routerHelper.findValidTransition(entity, handlerOutput, {
        skipEventCheck: true,
      });

      if (!nextTransition) {
        logger.warn(`There's no valid next transition from ${updatedStatus} or the condition is not met. (${urn})`);
        return { status: 'no_transition', state: updatedStatus };
      }

      const nextEvent = Array.isArray(nextTransition.event) ? nextTransition.event[0] : nextTransition.event;
      logger.log(`Next event: ${nextEvent} for entity ${urn}`);
      return {
        status: 'continued',
        nextEvent: {
          event: nextEvent as string,
          urn,
          payload: handlerOutput,
          attempt: 0,
        },
      };
    } catch (e) {
      await entityService.update(entity, definition.states.failed);
      logger.error(`Transition failed. Setting status to failed (${(e as Error).message})`, urn);
      // UnretriableException signals a permanent failure — don't rethrow so the
      // message is not retried by the broker/Lambda adapter.
      if (!(e instanceof UnretriableException)) {
        throw e;
      }
      return {
        status: 'final',
        state: definition.states.failed as string | number,
      };
    }
  }
}
