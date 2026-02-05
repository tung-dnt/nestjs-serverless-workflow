import type {
  IBackoffRetryConfig,
  IRetryHandler,
  ISagaHistoryStore,
  IWorkflowDefaultRoute,
  IWorkflowDefinition,
  IWorkflowEntity,
  IWorkflowHandler,
  IWorkflowRouteWithSaga,
  TDefaultHandler,
  TEither,
} from '@/core';
import { getRetryKey, WORKFLOW_DEFAULT_EVENT, WORKFLOW_DEFINITION_KEY, WORKFLOW_HANDLER_KEY } from '@/core';
import type { IBrokerPublisher, IWorkflowEvent } from '@/event-bus';
import { UnretriableException } from '@/exception/unretriable.exception';
import { BadRequestException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, ModuleRef } from '@nestjs/core';
import { StateRouterHelperFactory } from './router.factory';

/**
 * Result of executing a single workflow step.
 * Used by external state machines (like AWS Step Functions) to manage transitions.
 */
export interface IStepExecutionResult<T = any> {
  /** The updated entity after executing the step */
  entity: T;
  /** The current status of the entity after the step */
  status: string | number;
  /** Whether the entity has reached a final state */
  isFinal: boolean;
  /** The payload returned by the handler (can be used by next step) */
  handlerResult: any;
  /** The event that was executed */
  event: string;
}

/**
 * TODO:
 * 1. SAGA: SAGA transaction will update history storage each transition, history service is implemented from `ISagaHistoryStore`
 *   +) If reverese order, execute compensations in reverse order
 *   +) If in-order, execute compensations in order
 *   +) If parallel, execute compensations in parallel
 * 2. Replay workflow:
 *   +) If compensation in-progress, execute compensation first
 *   +) If compensation completed, start from start state
 *   +) If no compensation and transaction is failed, start from last failed state
 *   +) If no compensation and transaction is completed, throw error
 * 3. Checkpointing for long-running tasks (Serverless)
 *   +) Handle serverless function timeout, store current entity state to checkpoint broker via `BrokerPublisher`
 *   +) BrokerPublisher.publish will implement delay queue via time calculated from RetryService.execute()
 * 4. Retry Service: Retry in state handler level via `IRetryHandler`
 *   +) If CompensationHandler
 * 5. Timeout handling: listen for timeout event emitted by Runtime Adapter (DEV DONE - TESTING)
 */
@Injectable()
export class OrchestratorService implements OnModuleInit {
  private routes = new Map<string, TEither<IWorkflowDefaultRoute, IWorkflowRouteWithSaga>>();
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
      if (!instance || !instance.constructor) continue;

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

      const brokerPublisher = this.moduleRef.get<IBrokerPublisher>(workflowDefinition.brokerPublisher, {
        strict: true,
      });
      const entityService = this.moduleRef.get<IWorkflowEntity>(workflowDefinition.entityService, { strict: true });
      const historyService = workflowDefinition.saga
        ? this.moduleRef.get<ISagaHistoryStore>(workflowDefinition.saga.historyService, {
            strict: true,
          })
        : undefined;

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
          brokerPublisher,
          historyService,
        });
      }
    }
    this.logger.log(`StateRouter initialized with ${this.routes.size} routes: `, Array.from(this.routes.keys()));
  }

  /**
   * Returns the list of registered event names.
   * Useful for creating Lambda handler mappings.
   */
  getRegisteredEvents(): string[] {
    return Array.from(this.routes.keys());
  }

  /**
   * Executes a single workflow step without automatic transitions.
   * This method is designed for use with external state machines (like AWS Step Functions)
   * that manage the workflow orchestration themselves.
   *
   * @param params - The workflow event containing event, urn, payload, and attempt
   * @returns Result containing the updated entity, status, and whether it's a final state
   */
  async executeStep(params: IWorkflowEvent): Promise<IStepExecutionResult> {
    const { urn, payload, attempt, topic: event } = params;

    const route = this.routes.get(event);
    if (!route) throw new BadRequestException(`No workflow found for event: ${event}`);
    const { definition, instance, defaultHandler, entityService } = route;

    if (!definition) {
      const className = instance.name;
      throw new BadRequestException(
        `Workflow definition metadata is missing for controller class "${className}". Ensure @Workflow(...) is applied to the class and that decorators are not reordered.`,
      );
    }

    const logger = new Logger(`Router::${definition.name}`);
    const routerHelper = this.routerHelperFactory.create(event, entityService, definition, logger);
    logger.log(`executeStep: Method ${route.handlerName} is being called with arguments:`, params);

    // Load entity
    let entity = await routerHelper.loadAndValidateEntity(urn);
    const entityStatus = entityService.status(entity);

    // Find valid transition for this event
    const transition = routerHelper.findValidTransition(entity, payload);

    if (!transition) {
      if (defaultHandler) {
        logger.log(`Falling back to the default transition`, urn);
        await defaultHandler(entity, event, payload);
      }
      throw new BadRequestException(
        `No matched transition for event: ${event}, status: ${entityStatus}. Please verify your workflow definition!`,
      );
    }

    // Execute the single step
    try {
      logger.log('======= SINGLE WORKFLOW STEP STARTED =======');
      const currentEntityStatus = entityService.status(entity);
      logger.log(`Executing transition from ${currentEntityStatus} to ${transition.to} (${urn})`);

      // Execute handler
      const { handlerName, handler, retryConfig } = route;
      const args = routerHelper.buildParamDecorators(entity, payload, instance, handlerName);

      let handlerResult: any;
      try {
        handlerResult = await handler.apply(instance, args);
      } catch (e) {
        if (!retryConfig) throw e;

        const { maxAttempts } = retryConfig;
        if (e instanceof BadRequestException || e instanceof UnretriableException || attempt >= maxAttempts) {
          logger.error('Unretriable exception found!');
          throw e;
        }

        await this.moduleRef.get<IRetryHandler>(retryConfig.handler).execute();
        throw e;
      }

      // Update entity status
      entity = await entityService.update(entity, transition.to);
      const updatedStatus = entityService.status(entity);
      logger.log(`Element transitioned from ${currentEntityStatus} to ${transition.to} (${urn})`);

      // Check if final state
      const definedFinalStates = definition.states.finals as Array<string | number>;
      const isFinal = definedFinalStates.includes(updatedStatus);

      if (isFinal) {
        logger.log(`Element ${urn} reached final state: ${updatedStatus}`);
      }

      return {
        entity,
        status: updatedStatus,
        isFinal,
        handlerResult,
        event,
      };
    } catch (e) {
      await entityService.update(entity, definition.states.failed);
      logger.error(`Step execution failed. Setting status to failed (${(e as Error).message})`, urn);
      throw e;
    }
  }

  /**
   * Executes the full workflow with automatic transitions (original behavior).
   * Use this when you want the library to manage the entire state machine internally.
   * For external state machines (like AWS Step Functions), use `executeStep` instead.
   */
  async transit(params: IWorkflowEvent) {
    const { urn, payload, attempt, topic: event } = params;

    const route = this.routes.get(event);
    if (!route) throw new BadRequestException(`No workflow found for event: ${event}`);
    const { definition, instance, defaultHandler, entityService } = route;

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
    let transition = routerHelper.findValidTransition(entity, payload);
    let stepPayload = payload;

    if (!transition) {
      if (defaultHandler) {
        logger.log(`Falling back to the default transition`, urn);
        await defaultHandler(entity, event, payload);
      }
      throw new BadRequestException(
        `No matched transition for event: ${event}, status: ${entityStatus}. Please verify your workflow definition!`,
      );
    }

    try {
      while (!!transition) {
        logger.log('======= WORKFLOW STEP STARTED =======');
        if (routerHelper.isInIdleStatus(entity)) {
          if (!transition.conditions) {
            throw new BadRequestException(
              `Idle state ${entityStatus} transitions must provide conditions for further navigation, please check for workflow definition and try again!`,
            );
          }

          if (transition.conditions.some((condition) => !condition)) {
            logger.log(
              `Element ${urn} is idle from ${transition.from} to ${transition.to} status. Waiting for external event...`,
            );
            break;
          }
        }

        const currentEntityStatus = entityService.status(entity);
        logger.log(`Executing transition from ${currentEntityStatus} to ${transition.to} (${urn})`);

        // Get the correct handler for the current transition event
        const currentEvent = Array.isArray(transition.event) ? transition.event[0] : transition.event;
        const currentRoute = this.routes.get(currentEvent as string);
        if (!currentRoute) {
          throw new BadRequestException(`No handler found for event: ${currentEvent}`);
        }
        const { handlerName, handler, retryConfig } = currentRoute;
        const args = routerHelper.buildParamDecorators(entity, stepPayload, instance, handlerName);

        try {
          stepPayload = await handler.apply(instance, args);
        } catch (e) {
          if (!retryConfig) throw e;

          const { maxAttempts } = retryConfig;
          if (e instanceof BadRequestException || e instanceof UnretriableException || attempt >= maxAttempts) {
            logger.error('Unretriable exception found!');
            return;
          }

          // TODO: add more payload: original method, payload, entity, retryConfigs
          await this.moduleRef.get<IRetryHandler>(retryConfig.handler).execute();
        }

        // Update entity status
        entity = await entityService.update(entity, transition.to);
        logger.log(`Element transitioned from ${currentEntityStatus} to ${transition.to} (${urn})`);

        const updatedStatus = entityService.status(entity);

        const definedFinalStates = definition.states.finals as Array<string | number>;
        if (definedFinalStates.includes(updatedStatus)) {
          logger.log(`Element ${urn} reached final state: ${updatedStatus}`);
          break;
        }

        // NOTE: Get next event for automatic transitions
        transition = routerHelper.findValidTransition(entity, stepPayload, {
          skipEventCheck: true,
        });
        if (!transition) {
          logger.warn(`There's no valid next transition from ${updatedStatus} or the condition is not met. (${urn})`);
        }

        logger.log(`Next event: ${transition?.event ?? 'none'} Next status: ${updatedStatus} (${urn})`);
      }
    } catch (e) {
      await entityService.update(entity, definition.states.failed);
      logger.error(`Transition failed. Setting status to failed (${(e as Error).message})`, urn);
      throw e;
    }
  }
}
