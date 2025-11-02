import { WORKFLOW_DEFAULT_EVENT } from './workflow.decorator';

export const OnDefault = (target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
  let existingFallback = Reflect.getMetadata(WORKFLOW_DEFAULT_EVENT, target.constructor);
  if (!existingFallback) {
    Reflect.defineMetadata(WORKFLOW_DEFAULT_EVENT, descriptor.value, target.constructor);
  }
  return descriptor;
};
