import { IWorkflowHandler } from '../types/handler-store.interface';
import { WORKFLOW_HANDLER_KEY } from './workflow.decorator';

export const OnEvent =
  <T, State = string>(event: string) =>
  (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    let workflowHandlers: IWorkflowHandler[] = Reflect.getMetadata(WORKFLOW_HANDLER_KEY, target.constructor);

    if (!workflowHandlers) {
      workflowHandlers = [];
      Reflect.defineMetadata(WORKFLOW_HANDLER_KEY, workflowHandlers, target.constructor);
    }

    workflowHandlers.push({ event, handler: descriptor.value, name: propertyKey });

    return descriptor;
  };
