import { OrchestratorService, type IWorkflowEvent, type TransitResult } from '@/core';

/**
 * Abstract base for workflow adapters.
 *
 * Owns the orchestration loop — call `transit()`, dispatch by status, repeat.
 * Concrete adapters override the handler methods to plug in infrastructure
 * (checkpointing, callbacks, queues, HTTP responses, etc.).
 *
 * @typeParam TContext  - Adapter-specific execution context (e.g. IDurableContext)
 * @typeParam TResult   - The value returned when the workflow completes
 */
export abstract class BaseWorkflowAdapter<TContext, TResult> {
  constructor(protected readonly orchestrator: OrchestratorService) {}

  /**
   * Run the workflow loop until a final state is reached.
   */
  protected async runWorkflowLoop(initialEvent: IWorkflowEvent, ctx: TContext): Promise<TResult> {
    let currentEvent = initialEvent;
    let iteration = 0;

    while (true) {
      const result = await this.executeTransit(currentEvent, iteration, ctx);

      switch (result.status) {
        case 'final':
          return this.onFinal(result, currentEvent, ctx);

        case 'idle':
          currentEvent = await this.onIdle(result, currentEvent, iteration, ctx);
          break;

        case 'continued':
          currentEvent = await this.onContinued(result, iteration, ctx);
          break;

        case 'no_transition':
          currentEvent = await this.onNoTransition(result, currentEvent, iteration, ctx);
          break;
      }

      iteration++;
    }
  }

  // ─── Abstract hooks ────────────────────────────────────────────────

  /** Execute a single transit step (may include retry, checkpointing, etc.) */
  protected abstract executeTransit(
    event: IWorkflowEvent,
    iteration: number,
    ctx: TContext,
  ): Promise<TransitResult>;

  /** Workflow reached a terminal state — return the final result. */
  protected abstract onFinal(
    result: Extract<TransitResult, { status: 'final' }>,
    event: IWorkflowEvent,
    ctx: TContext,
  ): TResult;

  /** Entity is idle — wait for an external callback and return the next event. */
  protected abstract onIdle(
    result: Extract<TransitResult, { status: 'idle' }>,
    event: IWorkflowEvent,
    iteration: number,
    ctx: TContext,
  ): Promise<IWorkflowEvent>;

  /** Auto-transition found — checkpoint if needed and return the next event. */
  protected abstract onContinued(
    result: Extract<TransitResult, { status: 'continued' }>,
    iteration: number,
    ctx: TContext,
  ): Promise<IWorkflowEvent>;

  /** No unambiguous transition — wait for an explicit external event. */
  protected abstract onNoTransition(
    result: Extract<TransitResult, { status: 'no_transition' }>,
    event: IWorkflowEvent,
    iteration: number,
    ctx: TContext,
  ): Promise<IWorkflowEvent>;
}
