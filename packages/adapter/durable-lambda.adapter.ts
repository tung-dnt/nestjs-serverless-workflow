import type { INestApplicationContext } from '@nestjs/common';
import { OrchestratorService, type IWorkflowEvent } from '@/core';

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

  return withDurableExecution(async (event: DurableWorkflowEvent, ctx: IDurableContext) => {
    let currentEvent: IWorkflowEvent = {
      event: event.initialEvent,
      urn: event.urn,
      payload: event.payload,
      attempt: 0,
    };

    let iteration = 0;

    while (true) {
      const result = await orchestrator.transit(currentEvent);

      switch (result.status) {
        case 'final':
          return { urn: event.urn, status: 'completed', state: result.state } satisfies DurableWorkflowResult;

        case 'idle': {
          const callbackPayload = await ctx.waitForCallback<{ event: string; payload?: any }>(
            `idle:${result.state}:${iteration}`,
            async (callbackId: string) => {
              // External systems use this callbackId to resume the workflow
              // via SendDurableExecutionCallbackSuccess Lambda API
              ctx.logger.info(`Waiting for callback at idle state ${result.state}`, { callbackId });
            },
            // TODO: remove hard-coded, exposed via execution function
            { timeout: { hours: 24 } },
          );

          currentEvent = {
            event: callbackPayload.event,
            urn: event.urn,
            payload: callbackPayload.payload,
            attempt: 0,
          };
          break;
        }

        case 'continued': {
          // Checkpoint the progression — on replay, returns stored result
          await ctx.step(`${result.nextEvent.event}:${iteration}`, async () => result.nextEvent);
          currentEvent = result.nextEvent;
          break;
        }

        case 'no_transition': {
          // No unambiguous auto-transition — wait for explicit event via callback
          const noTransitionPayload = await ctx.waitForCallback<{ event: string; payload?: any }>(
            `awaiting:${result.state}:${iteration}`,
            async (callbackId: string) => {
              ctx.logger.info(`No auto-transition from ${result.state}, waiting for explicit event`, { callbackId });
            },
            // TODO: remove hard-coded, exposed via execution function
            { timeout: { hours: 24 } },
          );
          currentEvent = {
            event: noTransitionPayload.event,
            urn: event.urn,
            payload: noTransitionPayload.payload,
            attempt: 0,
          };
          break;
        }
      }

      iteration++;
    }
  });
};
