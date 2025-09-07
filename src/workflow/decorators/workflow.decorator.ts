import { BrokerPublisher } from '@event-bus/types/worlflow-event-emitter.interface';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Entity } from '@workflow/types/entity.interface';
import { WorkflowController } from '@workflow/types/workflow-controller.interface';
import { WorkflowDefinition } from '@workflow/types/workflow-definition.interface';

export function Workflow<T, P, Event, State>(definition: WorkflowDefinition<T, P, Event, State>) {
  return function <T extends { new (...args: any[]): {} }>(instance: T) {
    @Injectable()
    class MyWorkflow extends instance implements WorkflowController<T, State> {
      public entityService: Entity<T, State>;
      public brokerPublisher: BrokerPublisher;
      public eventEmitter: EventEmitter2;
      public logger: Logger;

      constructor(...args: any[]) {
        super(...args.slice(3));
        this.entityService = args[0];
        this.eventEmitter = args[1];
        this.brokerPublisher = args[2];
        this.logger = new Logger(definition.name || instance.name);
      }
    }
    Reflect.defineMetadata('workflow:definition', definition, MyWorkflow);

    return MyWorkflow;
  };
}
