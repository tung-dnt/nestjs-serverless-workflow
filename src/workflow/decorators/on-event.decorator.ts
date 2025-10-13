import { IWorkflowHandler } from '../types/handler-store.interface';
import { WORKFLOW_HANDLER_KEY } from './workflow.decorator';

export const OnEvent =
  <T, State = string>(event: string) =>
  (target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
    const workflowHandlers: IWorkflowHandler[] = Reflect.getMetadata(WORKFLOW_HANDLER_KEY, target);

    workflowHandlers.push({ event, handler: descriptor.value });

    return descriptor;
  };
