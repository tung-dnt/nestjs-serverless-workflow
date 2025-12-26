import type { ISagaConfig, IWorkflowHandler } from '@/core';

export const WORKFLOW_HANDLER_KEY = 'workflow:metadata';

export const OnEvent = (event: string) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
  let workflowHandlers: IWorkflowHandler[] = Reflect.getMetadata(WORKFLOW_HANDLER_KEY, target.constructor);

  if (!workflowHandlers) {
    workflowHandlers = [];
    Reflect.defineMetadata(WORKFLOW_HANDLER_KEY, workflowHandlers, target.constructor);
  }

  workflowHandlers.push({ event, handler: descriptor.value, name: propertyKey });

  return descriptor;
};

export const OnCompensation =
  (event: string, config: ISagaConfig) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    let workflowHandlers: IWorkflowHandler[] = Reflect.getMetadata(WORKFLOW_HANDLER_KEY, target.constructor);

    if (!workflowHandlers) {
      workflowHandlers = [];
      Reflect.defineMetadata(WORKFLOW_HANDLER_KEY, workflowHandlers, target.constructor);
    }

    workflowHandlers.push({ event, handler: descriptor.value, name: propertyKey, sagaConfig: config });

    return descriptor;
  };
