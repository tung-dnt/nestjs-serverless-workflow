import { BrokerPublisher } from '@/event-bus/types/broker-publisher.interface';
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { IEntity } from './types';

@Module({})
export class WorkflowModule {
  static register(options: {
    imports?: any[];
    entities: Provider<IEntity>[];
    workflows: Provider[];
    broker: Provider<BrokerPublisher>;
  }): DynamicModule {
    const { imports, entities, workflows, broker } = options;
    const providers = [...(entities ?? []), ...(workflows ?? []), broker];

    return {
      module: WorkflowModule,
      imports: [DiscoveryModule, ...(imports ?? [])],
      providers: providers,
      exports: providers,
    };
  }
}
