import { Module, DynamicModule, Provider } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { IEntity, WorkflowController } from './types';
import { BrokerPublisher } from '@/event-bus/types/broker-publisher.interface';

@Module({})
export class WorkflowModule {
  static register(options: {
    imports?: any[];
    entities: Provider<IEntity>[];
    workflows: Provider<WorkflowController>[];
    broker: Provider<BrokerPublisher>;
  }): DynamicModule {
    const { imports, entities, workflows, broker } = options;
    const providers = [...(entities ?? []), ...(workflows ?? []), broker];

    return {
      module: WorkflowModule,
      imports: [EventEmitterModule.forRoot({ global: true }), ...(imports ?? [])],
      providers: providers,
      exports: providers,
    };
  }
}
