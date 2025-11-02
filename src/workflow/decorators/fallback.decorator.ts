import { WORKFLOW_FALLBACK_EVENT } from './workflow.decorator';

export const OnFallback = (target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
  let existingFallback = Reflect.getMetadata(WORKFLOW_FALLBACK_EVENT, target.constructor);
  if (!existingFallback) {
    Reflect.defineMetadata(WORKFLOW_FALLBACK_EVENT, descriptor.value, target.constructor);
  }
  return descriptor;
};
