import { Provider, Type } from '@nestjs/common';
import { KafkaEvent } from '@this/event-bus/kafka/types/kafka-event.interface';
import { EntityService } from '../entity.service';
import { TransitionEvent } from './transition-event';

/**
 * Defines the structure of a workflow definition, which includes the following properties:
 * - `FinalStates`: An array of states that represent the final states of the workflow.
 * - `IdleStates`: An array of states that represent the idle states of the workflow.
 * - `FailedState`: The state that represents a failed state in the workflow.
 * - `Transitions`: An array of transition events that define the allowed transitions between states.
 * - `Actions`: An optional array of actions that can be performed during the workflow.
 * - `Conditions`: An optional array of conditions that can be checked during the workflow.
 * - `Entity`: An object that defines the operations for creating, updating, loading, and retrieving the status and URN of the workflow entity.
 * - `Fallback`: An optional function that can be used as a fallback when a transition event is not defined.
 */
export interface WorkflowDefinition<T, P, Event, State> {
  name?: string;
  states: {
    finals: State[];
    idles: State[];
    failed: State;
  };
  options?: {};
  transitions: TransitionEvent<T, P, Event, State>[];
  actions?: Type<any>[];
  conditions?: Type<any>[];
  kafka?: {
    brokers: string;
    events: KafkaEvent<Event>[];
  };
  entity:
    | Provider<EntityService<T, State>>
    | Type<EntityService<T, State>>
    | {
        new: () => T;
        update: (entity: T, status: State) => Promise<T>;
        load: (urn: string) => Promise<T>;
        status: (entity: T) => State;
        urn: (entity: T) => string;
      };
  fallback?: (entity: T, event: Event, payload?: P | T | object | string) => Promise<T>;
}
