import type { Duration } from './shared.type';
import type { IWorkflowEvent } from './workflow-event.interface';

export type TransitResult =
  | { status: 'final'; state: string | number }
  | { status: 'idle'; state: string | number; timeout?: Duration }
  | { status: 'continued'; nextEvent: IWorkflowEvent }
  | { status: 'no_transition'; state: string | number; timeout?: Duration };
