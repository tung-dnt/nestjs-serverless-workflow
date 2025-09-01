import { TransitionEvent } from './transition-event.interface';

/**
 * Defines the structure of a workflow definition, which includes the following properties:
 * - `FinalStates`: An array of states that represent the final states of the workflow.
 * - `IdleStates`: An array of states that represent the idle states of the workflow.
 * - `FailedState`: The state that represents a failed state in the workflow.
 * - `Transitions`: An array of transition events that define the allowed transitions between states.
 * - `Fallback`: An optional function that can be used as a fallback when a transition event is not defined.
 * - `Actions`: An optional array of action classes for workflow actions.
 * - `Conditions`: An optional array of condition functions.
 * - `Entity`: An optional entity service or configuration for loading/updating entities.
 */
// TODO: check for overlapping rules of event + from state
export interface WorkflowDefinition<T, P, Event, State> {
  name: string;
  states: {
    finals: State[];
    idles: State[];
    failed: State;
  };
  transitions: TransitionEvent<T, P, Event, State>[];
  fallback?: (entity: T, event: Event, payload?: P | T | object | string) => Promise<T>;
  actions?: any[];
  conditions?: ((entity: T, payload?: P | T | object | string) => boolean)[];
  entity?: any;
}
