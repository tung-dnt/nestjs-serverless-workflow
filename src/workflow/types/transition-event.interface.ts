import { Trigger } from '@workflow/decorators/trigger.decorator';

/**
 * Defines the structure of a transition event in a workflow definition. This includes the following properties:
 * - `event`: The event that triggers the transition. Can be a single event or an array of events.
 * - `from`: The state(s) that the workflow is transitioning from. Can be a single state or an array of states.
 * - `to`: The state that the workflow is transitioning to.
 * - `conditions`: An optional array of conditions to be checked during the transition.
 * - `actions`: An optional array of actions to be executed during the transition.
 * Actions and conditions can be defined as functions that take an entity and an optional payload as arguments or
 * as workflow actions classes that are decorated with the `@OnEvent` and/or `@OnStatusChanged` decorator.
 */
export interface TransitionEvent<T, P, Event, States> {
  event: Event | Event[];
  from: States | States[];
  to: States;
  conditions?: ((entity: T, payload?: P | T | object | string) => boolean)[]; // | Type<any>[];
  actions?: ((entity: T, payload?: P | T | object | string) => Promise<T>)[];
}
