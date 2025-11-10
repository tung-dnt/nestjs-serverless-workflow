import { IBrokerPublisher, IWorkflowEvent } from '@/event-bus';
import { UnretriableException } from '@/exception/unretriable.exception';
import {
  getRetryKey,
  IBackoffRetryConfig,
  IRetryHandler,
  IWorkflowDefinition,
  IWorkflowEntity,
  IWorkflowHandler,
  IWorkflowRoute,
  StateRouterHelperFactory,
  TDefaultHandler,
  WORKFLOW_DEFAULT_EVENT,
  WORKFLOW_DEFINITION_KEY,
  WORKFLOW_HANDLER_KEY,
} from '@/workflow';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DiscoveryService, ModuleRef } from '@nestjs/core';
import { SagaService } from './saga.service';

@Injectable()
export class OchestratorService {
  private routes = new Map<string, IWorkflowRoute>();
  private readonly logger = new Logger(OchestratorService.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly routerHelperFactory: StateRouterHelperFactory,
    private readonly moduleRef: ModuleRef,
    private readonly sagaService: SagaService,
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

      if (!handlerStore || handlerStore.length === 0 || !workflowDefinition) {
        this.logger.warn(`No handlers found for workflow: ${workflowDefinition.name}`);
        continue;
      }

      const brokerPublisher = this.moduleRef.get<IBrokerPublisher>(workflowDefinition.brokerPublisher, {
        strict: true,
      });
      const entityService = this.moduleRef.get<IWorkflowEntity>(workflowDefinition.entityService, { strict: true });

      for (const handler of handlerStore) {
        if (this.routes.has(handler.event)) {
          throw new Error(
            `Duplicate workflow event handler detected for event: ${handler.event} in workflow: ${workflowDefinition.name}`,
          );
        }
        const retryConfig = this.moduleRef.get<IBackoffRetryConfig>(getRetryKey(handler.name));
        this.routes.set(handler.event, {
          handler: handler.handler,
          definition: workflowDefinition,
          instance,
          handlerName: handler.name,
          retryConfig,
          defaultHandler,
          entityService,
          brokerPublisher,
        });
      }
    }
    this.logger.log(`StateRouter initialized with ${this.routes.size} routes: `, Array.from(this.routes.keys()));
  }

  async transit(params: IWorkflowEvent) {
    const { urn, payload, attempt, topic: event } = params;

    if (!this.routes.has(event)) throw new BadRequestException(`No workflow found for event: ${event}`);

    const route = this.routes.get(event) as IWorkflowRoute;
    const { definition, instance, defaultHandler, brokerPublisher, entityService } = route;

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

        const args = routerHelper.buildParamDecorators(entity, stepPayload, instance, currentRoute.handlerName);

        try {
          stepPayload = await currentRoute.handler.apply(instance, args);
        } catch (e) {
          const retryConfig = currentRoute.retryConfig;
          if (!retryConfig) throw e;

          const { maxAttempts } = retryConfig;
          if (e instanceof BadRequestException || e instanceof UnretriableException || attempt >= maxAttempts) throw e;

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
      // NOTE: if max attempt reached or Unretriable error, set to failed status
      await entityService.update(entity, definition.states.failed);
      logger.error(`Transition failed. Setting status to failed (${(e as Error).message})`, urn);

      // TODO:
      // 1. Handle compensation logic here for saga pattern
      // 2. Handler Checkpointing for long-running tasks (Serverless)
      //
      // const compensations = this.sagaService.registerFailureSaga(definition, entity, e as Error);
      // await this.sagaService.executeCompensations(compensations, entity, brokerPublisher);
    }
  }
}
