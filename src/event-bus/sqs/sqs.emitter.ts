import { WorkflowEventEmitter } from "../types/worlflow-event-emitter.interface";

export class SqsEmitter implements WorkflowEventEmitter{
  async emit<T>(topic: string, payload: any): Promise<void> {}
}