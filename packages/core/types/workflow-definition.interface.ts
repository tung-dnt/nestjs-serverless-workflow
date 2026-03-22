import type { Duration, IBackoffRetryConfig, ITransitionEvent, IWorkflowEntity } from '@/core';

/**
 * Defines the structure of a workflow definition, which includes the following properties:
 * - `FinalStates`: An array of states that represent the final states of the workflow.
 * - `IdleStates`: An array of states that represent the idle states of the workflow.
 * - `FailedState`: The state that represents a failed state in the workflow.
 * - `Transitions`: An array of transition events that define the allowed transitions between states.
 * - `Fallback`: An optional function that can be used as a fallback when a transition event is not defined.
 * - `Conditions`: An optional array of condition functions.
 * - `Entity`: An optional entity service or configuration for loading/updating entities.
 */
/**
 * An idle state entry — either a bare state value or a state with per-state timeout.
 */
export type IdleStateEntry<State> = State | { state: State; timeout?: Duration };

export interface IWorkflowDefinition<T, Event, State> {
  name: string;
  states: {
    finals: State[];
    idles: IdleStateEntry<State>[];
    failed: State;
  };
  /**
   * Default timeout for callback waits (idle & no_transition states).
   * Per-state timeouts in `idles` take precedence over this value.
   */
  defaultCallbackTimeout?: Duration;
  transitions: ITransitionEvent<T, Event, State, any>[];
  conditions?: (<P>(entity: T, payload?: P | T | object | string) => boolean)[];
  /**
   * Injection token refer to entity services that implements IWorkflowEntity<T>
   */
  entityService: string;
}

export interface IWorkflowDefaultRoute {
  instance: any;
  definition: IWorkflowDefinition<any, string, string>;
  handlerName: string;
  handler: (...payload: any[]) => Promise<any>;
  defaultHandler?: TDefaultHandler<any>;
  entityService: IWorkflowEntity;
  retryConfig?: IBackoffRetryConfig;
}

export interface IWorkflowHandler {
  event: string;
  name: string;
  handler: (...payload: any[]) => Promise<any>;
}

export type TDefaultHandler<T, Event = string> = <P>(
  entity: T,
  event: Event,
  payload?: P | T | object | string,
) => Promise<T>;
