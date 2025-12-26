import { Injectable, Logger } from '@nestjs/common';
import type { IBrokerPublisher } from '@/event-bus';
import type { SagaContext, ISagaStep, ISagaConfig, IWorkflowDefinition, ISagaHistoryStore } from '@/core';
import { RollbackStrategy, SagaStatus } from '@/core';

@Injectable()
export class SagaService {
  private readonly logger = new Logger(SagaService.name);

  /**
   * Initialize a new SAGA context when workflow starts
   */
  async initializeSaga<T>(
    entity: T,
    definition: IWorkflowDefinition<T, any, any>,
    historyService: ISagaHistoryStore<T>,
  ): Promise<SagaContext<T>> {
    const sagaId = definition.saga?.sagaIdGenerator
      ? definition.saga.sagaIdGenerator()
      : `saga-${Date.now()}-${Math.random()}`;

    const context: SagaContext<T> = {
      sagaId,
      entity,
      executedSteps: [],
      status: SagaStatus.RUNNING,
      startedAt: new Date(),
      metadata: {
        workflowName: definition.name,
      },
    };

    await historyService.saveSagaContext(context);
    this.logger.log(`SAGA initialized: ${sagaId}`);
    return context;
  }

  /**
   * Record a successful step execution
   */
  async recordStep<T, P>(
    context: SagaContext<T>,
    event: string,
    beforeState: T,
    afterState: T,
    payload: P,
    historyService: ISagaHistoryStore<T>,
  ): Promise<void> {
    const step: ISagaStep<T, P> = {
      event,
      executedAt: new Date(),
      beforeState,
      afterState,
      payload,
      compensated: false,
    };

    context.executedSteps.push(step);
    await historyService.saveSagaContext(context);
    this.logger.log(`SAGA step recorded: ${event} (${context.sagaId})`);
  }

  /**
   * Mark SAGA as failed and prepare for compensation
   */
  async markSagaFailed<T>(context: SagaContext<T>, error: Error, historyService: ISagaHistoryStore<T>): Promise<void> {
    context.status = SagaStatus.COMPENSATING;
    context.error = error;
    await historyService.saveSagaContext(context);
    this.logger.error(`SAGA failed: ${context.sagaId}. Error: ${error.message}`);
  }

  /**
   * Execute compensations based on the rollback strategy
   */
  async executeCompensations<T>(
    context: SagaContext<T>,
    sagaConfig: ISagaConfig,
    compensationHandlers: Map<string, Function>,
    instance: any,
    brokerPublisher: IBrokerPublisher,
    historyService: ISagaHistoryStore<T>,
  ): Promise<void> {
    this.logger.log(`Starting compensations for SAGA: ${context.sagaId}`);

    const stepsToCompensate = context.executedSteps.filter((step) => !step.compensated);

    try {
      switch (sagaConfig.rollbackStrategy) {
        case RollbackStrategy.REVERSE_ORDER:
          await this.executeReversedCompensations(
            stepsToCompensate.reverse(),
            compensationHandlers,
            instance,
            context,
            sagaConfig.failFast ?? false,
            historyService,
          );
          break;

        case RollbackStrategy.IN_ORDER:
          await this.executeReversedCompensations(
            stepsToCompensate,
            compensationHandlers,
            instance,
            context,
            sagaConfig.failFast ?? false,
            historyService,
          );
          break;

        case RollbackStrategy.PARALLEL:
          await this.executeParallelCompensations(
            stepsToCompensate,
            compensationHandlers,
            instance,
            context,
            historyService,
          );
          break;
      }

      context.status = SagaStatus.COMPENSATED;
      context.completedAt = new Date();
      await historyService.saveSagaContext(context);
      this.logger.log(`SAGA compensations completed: ${context.sagaId}`);
    } catch (error) {
      context.status = SagaStatus.FAILED;
      await historyService.saveSagaContext(context);
      this.logger.error(`SAGA compensation failed: ${context.sagaId}`, error);
      throw error;
    }
  }

  /**
   * Execute compensations in order (reversed or in-order)
   */
  private async executeReversedCompensations<T>(
    steps: ISagaStep<T>[],
    compensationHandlers: Map<string, Function>,
    instance: any,
    context: SagaContext<T>,
    failFast: boolean,
    historyService: ISagaHistoryStore<T>,
  ): Promise<void> {
    const errors: Error[] = [];

    for (const step of steps) {
      const compensationHandler = compensationHandlers.get(step.event);
      if (!compensationHandler) {
        this.logger.warn(`No compensation handler found for event: ${step.event}`);
        continue;
      }

      try {
        this.logger.log(`Executing compensation for: ${step.event}`);
        await compensationHandler.apply(instance, [step.beforeState, step.payload]);
        step.compensated = true;
        await historyService.saveSagaContext(context);
      } catch (error) {
        this.logger.error(`Compensation failed for ${step.event}:`, error);
        errors.push(error as Error);
        if (failFast) {
          throw error;
        }
      }
    }

    if (errors.length > 0 && !failFast) {
      throw new Error(`${errors.length} compensation(s) failed`);
    }
  }

  /**
   * Execute all compensations in parallel
   */
  private async executeParallelCompensations<T>(
    steps: ISagaStep<T>[],
    compensationHandlers: Map<string, Function>,
    instance: any,
    context: SagaContext<T>,
    historyService: ISagaHistoryStore<T>,
  ): Promise<void> {
    const compensationPromises = steps.map(async (step) => {
      const compensationHandler = compensationHandlers.get(step.event);
      if (!compensationHandler) {
        this.logger.warn(`No compensation handler found for event: ${step.event}`);
        return;
      }

      try {
        this.logger.log(`Executing compensation for: ${step.event}`);
        await compensationHandler.apply(instance, [step.beforeState, step.payload]);
        step.compensated = true;
      } catch (error) {
        this.logger.error(`Compensation failed for ${step.event}:`, error);
        throw error;
      }
    });

    await Promise.all(compensationPromises);
    await historyService.saveSagaContext(context);
  }

  /**
   * Resume a SAGA from a checkpoint (for replay scenarios)
   */
  async resumeSaga<T>(sagaId: string, historyService: ISagaHistoryStore<T>): Promise<SagaContext<T> | null> {
    const context = await historyService.getSagaContext(sagaId);
    if (!context) {
      this.logger.warn(`No SAGA context found for: ${sagaId}`);
      return null;
    }

    this.logger.log(`Resuming SAGA: ${sagaId}, status: ${context.status}`);
    return context;
  }
}
