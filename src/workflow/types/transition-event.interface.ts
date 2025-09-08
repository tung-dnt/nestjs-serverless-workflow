/**
 * Defines the structure of a transition event in a workflow definition. This includes the following properties:
 * - `event`: The event that triggers the transition.
 * - `from`: The state that the workflow is transitioning from.
 * - `to`: The state that the workflow is transitioning to.
 * - `conditions`: An optional array of conditions to be checked during the transition.
 * Actions and conditions can be defined as functions that take an entity and an optional payload as arguments or
 * as workflow actions classes that are decorated with the `@OnEvent` and/or `@OnStatusChanged` decorator.
 */
export interface TransitionEvent<T, Event, States = string> {
  event: Event;
  from: States[];
  to: States;
  conditions?: (<P>(entity: T, payload?: P | T | object | string) => boolean)[]; // | Type<any>[];
}
