import { Post } from '@nestjs/common';
import { WorkflowController } from '@workflow/types/workflow-controller.interface';

export const Trigger =
  <T, State>(event: string) =>
  (target: WorkflowController<T, State>, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const definition = Reflect.getMetadata('workflow:definition', target.constructor);
      console.log(`Method ${propertyKey} is being called with arguments:`, args);
      const entity = await target.entityService.load('')

      /**
       * 1) Fetch Entity state
       * 2) Check if transition is valid
       * 3) Execute action
       * 4) Update entity state
       * 5) Emit event
       * 6) Handle errors and retries
       * 7) Log the transition
       * 8) Emit event for next step
       */
      const result = await originalMethod.apply(this, args);

      await target.entityService.update(entity, result.state);
      await target.eventEmitter.emit('OrderCreated', { orderId: result.id });
    };
    return Post(event)(target, event, descriptor);
  };

// Payment::: 1. Created -> 2. Pending -> 3. Completed
