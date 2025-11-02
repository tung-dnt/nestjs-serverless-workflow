import { IBrokerPublisher } from '@/event-bus/types/broker-publisher.interface';
import { UnretriableException } from '@/exception/unretriable.exception';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DiscoveryService, ModuleRef } from '@nestjs/core';

import { WORKFLOW_DEFINITION_KEY, WORKFLOW_DEFAULT_EVENT, WORKFLOW_HANDLER_KEY } from './decorators';
import { StateRouterHelperFactory } from './router.factory';
import { IWorkflowEntity, IWorkflowHandler, IWorkflowDefinition } from './types';
import { TDefaultHandler } from './types/default.interface';

type WorkflowRoute = {
  instance: any;
  definition: IWorkflowDefinition<any, string, string>;
  handlerName: string;
  handler: (payload: any) => Promise<any>;
  defaultHandler?: TDefaultHandler<any>;
  entityService: IWorkflowEntity;
  brokerPublisher: IBrokerPublisher;
};
/**
 * TODO:
 * 1. Declare workflow definition by service token (DONE using workflow discovery)
 * 2. Create `StateRouterSerivce` (DONE)
 * 3. Create `SagaService`
 * 4. Create `@OnCompensation`
 * 5. Handle workflow session recovery from failed states (PLAN: using SQS message filtering)
 * 6. Timeout handling (IN_PROGRESS)
 * 7. Error handling (DONE) -> migrate to BrokerPublisher.retry instead of SQS batchItemFailures
 */
@Injectable()
export class OchestratorService {
  private routes = new Map<string, WorkflowRoute>();
  private readonly logger = new Logger(OchestratorService.name);

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
        Reflect.getMetadata(WORKFLOW_DEFINITION_KEY, instance.constructor) as IWorkflowDefinition<any, string, string>,
        Reflect.getMetadata(WORKFLOW_HANDLER_KEY, instance.constructor) as IWorkflowHandler[],
        Reflect.getMetadata(WORKFLOW_DEFAULT_EVENT, instance.constructor) as TDefaultHandler<any>,
      ];

      if (!handlerStore || handlerStore.length === 0 || !workflowDefinition) {
        this.logger.warn(`No handlers found for workflow: ${workflowDefinition.name}`);
        continue;
      }

      const brokerPublisher = this.moduleRef.get<IBrokerPublisher>(workflowDefinition.brokerPublisher, {
        strict: false,
      });
      const entityService = this.moduleRef.get<IWorkflowEntity>(workflowDefinition.entityService, { strict: false });

      for (const handler of handlerStore) {
        if (this.routes.has(handler.event)) {
          throw new Error(
            `Duplicate workflow event handler detected for event: ${handler.event} in workflow: ${workflowDefinition.name}`,
          );
        }
        this.routes.set(handler.event, {
          handler: handler.handler,
          definition: workflowDefinition,
          instance,
          handlerName: handler.name,
          defaultHandler,
          entityService,
          brokerPublisher,
        });
      }
    }
    this.logger.log(`StateRouter initialized with ${this.routes.size} routes: `, Array.from(this.routes.keys()));
  }

  async transit<P>(event: string, params: { urn: string | number; payload: P; attempt: number }) {
    if (!this.routes.has(event)) throw new BadRequestException(`No workflow found for event: ${event}`);

    const route = this.routes.get(event) as WorkflowRoute;
    const { definition, instance, defaultHandler, brokerPublisher, entityService } = route;

    if (!definition) {
      const className = instance.name;
      throw new BadRequestException(
        `Workflow definition metadata is missing for controller class "${className}". Ensure @Workflow(...) is applied to the class and that decorators are not reordered.`,
      );
    }

    const logger = new Logger(`Router::${definition.name}`);
    const routerHelper = this.routerHelperFactory.create(event, entityService, definition, logger);
    const { urn, payload, attempt } = params;
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
        stepPayload = await currentRoute.handler.apply(instance, args);

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
      // TODO: add runtime timeout calculator
    } catch (e) {
      const maxAttempts = definition?.retry?.maxAttempts ?? 1;
      // NOTE: if max attempt reached or Unretriable error, set to failed status
      if (e instanceof BadRequestException || e instanceof UnretriableException || attempt >= maxAttempts) {
        await entityService.update(entity, definition.states.failed);
        logger.error(`Transition failed. Setting status to failed (${e.message})`, urn);
      } else {
        if (!transition) {
          logger.error(`No transition available to retry (${urn})`);
          return;
        }
        const currentAttempt = attempt + 1;
        // NOTE: retry by put current state back to broker
        await brokerPublisher.retry(
          { topic: transition.event, urn, attempt: currentAttempt, payload: stepPayload },
          maxAttempts,
        );
      }
    }
  }
}
