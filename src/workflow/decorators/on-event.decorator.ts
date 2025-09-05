import { Trigger } from "./trigger.decorator";

interface OnEventOptions {
  event: any;
  order?: number;
}

/**
 * Decorator to mark a method as an event handler for a specific workflow event
 * @param options - Configuration options for the event handler
 * @param options.event - The event type that this handler responds to
 * @param options.order - Optional execution order when multiple handlers exist for the same event
 */
export function OnEvent(options: OnEventOptions) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // Store the event metadata for the workflow service to discover
    Reflect.defineMetadata('onEvent', options.event, target, propertyKey);
    
    // Store the order metadata if provided
    if (options.order !== undefined) {
      Reflect.defineMetadata('eventOrder', options.order, target, propertyKey);
    }
    
    return descriptor;
  };
}
