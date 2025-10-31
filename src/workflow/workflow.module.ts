import { IBrokerPublisher } from '@/event-bus/types/broker-publisher.interface';
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { StateRouterHelperFactory } from './router-helper.factory';
import { StateRouter } from './router.service';
import { IWorkflowEntity } from './types';

@Module({})
export class WorkflowModule {
  static register(options: {
    imports?: any[];
    entities: Provider<IWorkflowEntity>[];
    workflows: Provider[];
    brokers: Provider<IBrokerPublisher>[];
    providers?: Provider[];
  }): DynamicModule {
    const { imports, entities, workflows, brokers } = options;

    const providers = [...entities, ...workflows, ...brokers, StateRouterHelperFactory, StateRouter];

    return {
      module: WorkflowModule,
      imports: [DiscoveryModule, ...(imports ?? [])],
      providers: providers,
      exports: providers,
    };
  }
}
