import type { IBrokerPublisher } from '@/event-bus';
import type {
  IBackoffRetryConfig,
  ISagaConfig,
  ISagaHistoryStore,
  ISagaRollbackRule,
  ITransitionEvent,
  IWorkflowEntity,
} from '@/core';

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
export interface IWorkflowDefinition<T, Event, State> {
  name: string;
  states: {
    finals: State[];
    idles: State[];
    failed: State;
  };
  transitions: ITransitionEvent<T, Event, State, any>[];
  conditions?: (<P>(entity: T, payload?: P | T | object | string) => boolean)[];

  /**
   * TODO: When serverless function about to timeout, register thsis callback to checkpoint current entity state
   */
  onTimeout?: (<P>(entity: T, event: Event, payload?: P | T | object | string) => Promise<any>)[];

  /**
   * Injection token refer to entity services that implements IWorkflowEntity<T>
   */
  entityService: string;

  /**
   * Injection token refer to broker publisher that implements IBrokerPublisher
   */
  brokerPublisher: string;

  /**
   * Workflow saga configuration
   */
  saga?: ISagaConfig;
}

export interface IWorkflowDefaultRoute {
  instance: any;
  definition: IWorkflowDefinition<any, string, string>;
  handlerName: string;
  handler: (...payload: any[]) => Promise<any>;
  defaultHandler?: TDefaultHandler<any>;
  entityService: IWorkflowEntity;
  brokerPublisher: IBrokerPublisher;
  retryConfig?: IBackoffRetryConfig;
}

export interface IWorkflowRouteWithSaga extends IWorkflowDefaultRoute {
  sagaConfig?: ISagaRollbackRule;
  historyService?: ISagaHistoryStore;
}

export interface IWorkflowHandler {
  event: string;
  name: string;
  handler: (...payload: any[]) => Promise<any>;
  sagaConfig?: ISagaRollbackRule;
}

export type TDefaultHandler<T, Event = string> = <P>(
  entity: T,
  event: Event,
  payload?: P | T | object | string,
) => Promise<T>;
