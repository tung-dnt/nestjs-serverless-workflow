import { BROKER_PUBLISHER, BrokerPublisher } from '@/event-bus/types/broker-publisher.interface';
import { UnretriableException } from '@/exception/unretriable.exception';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { WORKFLOW_DEFINITION_KEY, WORKFLOW_HANDLER_KEY } from './decorators';
import { StateRouterHelper } from './router.helper';
import { IWorkflowHandler, WorkflowDefinition } from './types';

type WorkflowRoute = {
  instance: any;
  definition: WorkflowDefinition<any, string, string>;
  handlerName: string;
  handler: (payload: any) => Promise<any>;
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
export class StateRouter {
  private routes = new Map<string, WorkflowRoute>();
  private readonly logger = new Logger(StateRouter.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    @Inject(BROKER_PUBLISHER) private readonly broker: BrokerPublisher,
  ) {}

  onModuleInit() {
    const providers = this.discoveryService.getProviders();
    for (const provider of providers) {
      const { instance } = provider;
      if (!instance || !instance.constructor) continue;

      const workflowDefinition = Reflect.getMetadata(WORKFLOW_DEFINITION_KEY, instance.constructor);

      if (!workflowDefinition) continue;

      const handlerStore: IWorkflowHandler[] = Reflect.getMetadata(WORKFLOW_HANDLER_KEY, instance.constructor);

      if (!handlerStore || handlerStore.length === 0) {
        this.logger.warn(`No handlers found for workflow: ${workflowDefinition.name}`);
        continue;
      }

      for (const handler of handlerStore) {
        this.routes.set(handler.event, {
          handler: handler.handler,
          definition: workflowDefinition,
          instance,
          handlerName: provider.name,
        });
      }
    }
    this.logger.log(`StateRouter initialized with ${this.routes.size} routes: `, Array.from(this.routes.keys()));
  }

  async transit<P>(event: string, params: { urn: string | number; payload: P; attempt: number }) {
    if (!this.routes.has(event)) throw new BadRequestException(`No workflow found for event: ${event}`);

    const { definition, handler, instance, handlerName } = this.routes.get(event) as WorkflowRoute;

    if (!definition) {
      const className = instance.name;
      throw new BadRequestException(
        `Workflow definition metadata is missing for controller class "${className}". Ensure @Workflow(...) is applied to the class and that decorators are not reordered.`,
      );
    }

    const entityService = definition.entityService(instance);
    const logger = new Logger(definition.name);
    const routerHelper = new StateRouterHelper(event, entityService, definition, logger);
    const { urn, payload, attempt } = params;
    logger.log(`Method ${handlerName} is being called with arguments:`, params);

    // ========================= BEGIN routing logic =========================
    let entity = await routerHelper.loadAndValidateEntity(urn);
    const entityStatus = entityService.status(entity);

    let transition = routerHelper.findValidTransition(entity, payload);
    let stepPayload = payload;

    if (!transition) {
      if (definition.fallback) {
        logger.log(`Falling back to the default transition`, urn);
        await definition.fallback(entity, event, payload);
      }
      throw new BadRequestException(
        `No matched transition for event: ${event}, status: ${entityStatus}. Please verify your workflow definition!`,
      );
    }

    try {
      while (!!transition) {
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
        logger.log(`Executing transition from ${entityStatus} to ${transition.to}`, urn);

        const args = routerHelper.buildParamDecorators(entity, stepPayload, instance, handlerName);
        stepPayload = await handler.apply(instance, args);

        // Update entity status
        entity = await entityService.update(entity, transition.to);
        logger.log(`Element transitioned from ${entityStatus} to ${transition.to}`, urn);
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
          logger.warn(`There's no valid next transition from ${updatedStatus} or the condition is not met.`, urn);
        }

        logger.log(`Next event: ${transition?.event ?? 'none'} Next status: ${entityService.status(entity)} - `, urn);
      }
      // TODO: add runtime timeout calculator
    } catch (e) {
      const maxAttempts = definition.retry.maxAttempts;
      // NOTE: if max attempt reached or Unretriable error, set to failed status
      if (e instanceof BadRequestException || e instanceof UnretriableException || attempt >= maxAttempts) {
        await entityService.update(entity, definition.states.failed);
        logger.error(`Transition failed. Setting status to failed (${e.message})`, urn);
      } else {
        const currentAttempt = attempt + 1;
        // NOTE: retry by put current state back to broker
        await this.broker.retry(
          { topic: transition!.event, urn, attempt: currentAttempt, payload: stepPayload },
          maxAttempts,
        );
      }
    }
  }
}
