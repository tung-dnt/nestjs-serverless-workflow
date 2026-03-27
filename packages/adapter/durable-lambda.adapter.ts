import type { INestApplicationContext } from '@nestjs/common';
import { OrchestratorService, RetryBackoff, type IWorkflowEvent, type TransitResult } from '@/core';
import { UnretriableException } from '@/exception/unretriable.exception';
import { BaseWorkflowAdapter } from './base-workflow.adapter';

export interface DurableWorkflowEvent {
  urn: string | number;
  initialEvent: string;
  payload?: any;
}

export interface DurableWorkflowResult {
  urn: string | number;
  status: string;
  state: string | number;
}

/**
 * Minimal interface for the AWS Durable Execution SDK's DurableContext.
 * The actual SDK (`@aws/durable-execution-sdk-js`) is a peer dependency — only needed at runtime.
 */
export interface IDurableContext {
  step<T>(name: string, fn: () => Promise<T>): Promise<T>;
  waitForCallback<T>(
    name: string,
    onRegister: (callbackId: string) => Promise<void>,
    options?: { timeout?: { hours?: number; minutes?: number; seconds?: number } },
  ): Promise<T>;
  wait(duration: { seconds?: number; minutes?: number; hours?: number }): Promise<void>;
  logger: { info(msg: string, data?: any): void };
}

/**
 * Type for the withDurableExecution wrapper function from the AWS SDK.
 */
export type WithDurableExecution = <TEvent, TResult>(
  handler: (event: TEvent, ctx: IDurableContext) => Promise<TResult>,
) => (event: TEvent, ctx: any) => Promise<TResult>;

const DEFAULT_CALLBACK_TIMEOUT = { hours: 24 };

/**
 * Parse a callback result from the SDK.
 * The real SDK delivers callback results as JSON strings via SendDurableExecutionCallbackSuccess.
 */
function parseCallbackResult<T>(raw: unknown): T {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw as T;
    }
  }
  return raw as T;
}

/**
 * Concrete adapter that wraps the workflow orchestrator in an AWS durable execution.
 *
 * Each workflow instance runs as a single durable execution spanning multiple Lambda invocations.
 * Steps are checkpointed at event boundaries — on replay, completed steps return stored results.
 */
class DurableLambdaWorkflowAdapter extends BaseWorkflowAdapter<IDurableContext, DurableWorkflowResult> {
  private urn!: string | number;

  constructor(orchestrator: OrchestratorService) {
    super(orchestrator);
  }

  async run(event: DurableWorkflowEvent, ctx: IDurableContext): Promise<DurableWorkflowResult> {
    this.urn = event.urn;
    const initialEvent: IWorkflowEvent = {
      event: event.initialEvent,
      urn: event.urn,
      payload: event.payload,
      attempt: 0,
    };
    return this.runWorkflowLoop(initialEvent, ctx);
  }

  protected async executeTransit(
    currentEvent: IWorkflowEvent,
    iteration: number,
    ctx: IDurableContext,
  ): Promise<TransitResult> {
    const retryConfig = this.orchestrator.getRetryConfig(currentEvent.event);
    const maxAttempts = retryConfig?.maxAttempts ?? 1;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await ctx.step(`transit:${currentEvent.event}:${iteration}:${attempt}`, () =>
          this.orchestrator.transit(currentEvent),
        );
      } catch (e) {
        if (e instanceof UnretriableException) throw e;
        lastError = e as Error;

        if (attempt < maxAttempts - 1) {
          const delay = RetryBackoff.calculateDelay(attempt, retryConfig!);
          ctx.logger.info(
            `Handler ${currentEvent.event} failed (attempt ${attempt + 1}/${maxAttempts}), retrying in ${delay}ms`,
          );
          await ctx.wait({ seconds: Math.ceil(delay / 1000) });
        }
      }
    }

    throw lastError!;
  }

  protected onFinal(
    result: Extract<TransitResult, { status: 'final' }>,
    _event: IWorkflowEvent,
    _ctx: IDurableContext,
  ): DurableWorkflowResult {
    return { urn: this.urn, status: 'completed', state: result.state };
  }

  protected async onIdle(
    result: Extract<TransitResult, { status: 'idle' }>,
    _event: IWorkflowEvent,
    iteration: number,
    ctx: IDurableContext,
  ): Promise<IWorkflowEvent> {
    const timeout = result.timeout ?? DEFAULT_CALLBACK_TIMEOUT;
    const raw = await ctx.waitForCallback<string>(
      `idle:${result.state}:${iteration}`,
      async (callbackId: string) => {
        ctx.logger.info(`Waiting for callback at idle state ${result.state}`, { callbackId });
      },
      { timeout },
    );
    const callbackPayload = parseCallbackResult<{ event: string; payload?: any }>(raw);
    return {
      event: callbackPayload.event,
      urn: this.urn,
      payload: callbackPayload.payload,
      attempt: 0,
    };
  }

  protected async onContinued(
    result: Extract<TransitResult, { status: 'continued' }>,
    iteration: number,
    ctx: IDurableContext,
  ): Promise<IWorkflowEvent> {
    // Checkpoint the progression — on replay, returns stored result
    await ctx.step(`${result.nextEvent.event}:${iteration}`, async () => result.nextEvent);
    return result.nextEvent;
  }

  protected async onNoTransition(
    result: Extract<TransitResult, { status: 'no_transition' }>,
    _event: IWorkflowEvent,
    iteration: number,
    ctx: IDurableContext,
  ): Promise<IWorkflowEvent> {
    const timeout = result.timeout ?? DEFAULT_CALLBACK_TIMEOUT;
    const raw = await ctx.waitForCallback<string>(
      `awaiting:${result.state}:${iteration}`,
      async (callbackId: string) => {
        ctx.logger.info(`No auto-transition from ${result.state}, waiting for explicit event`, { callbackId });
      },
      { timeout },
    );
    const noTransitionPayload = parseCallbackResult<{ event: string; payload?: any }>(raw);
    return {
      event: noTransitionPayload.event,
      urn: this.urn,
      payload: noTransitionPayload.payload,
      attempt: 0,
    };
  }
}

/**
 * Creates a Lambda handler that wraps the workflow orchestrator in a durable execution.
 *
 * Each workflow instance runs as a single durable execution spanning multiple Lambda invocations.
 * Steps are checkpointed at event boundaries — on replay, completed steps return stored results.
 *
 * Idle states pause via `ctx.waitForCallback()` until an external system submits a callback.
 * Final states end the durable execution.
 *
 * @param app - NestJS application context
 * @param withDurableExecution - The `withDurableExecution` function from `@aws/durable-execution-sdk-js`
 */
export const DurableLambdaEventHandler = (app: INestApplicationContext, withDurableExecution: WithDurableExecution) => {
  const orchestrator = app.get(OrchestratorService);
  const adapter = new DurableLambdaWorkflowAdapter(orchestrator);

  return withDurableExecution(async (event: DurableWorkflowEvent, ctx: IDurableContext) => {
    return adapter.run(event, ctx);
  });
};
