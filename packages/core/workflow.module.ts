import { OrchestratorService, StateRouterHelperFactory } from '@/core';
import type { IBrokerPublisher } from '@/event-bus';
import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import type { IWorkflowEntity } from './types';

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

    const providers = [...entities, ...workflows, ...brokers, StateRouterHelperFactory, OrchestratorService];

    return {
      module: WorkflowModule,
      imports: [DiscoveryModule, ...(imports ?? [])],
      providers: providers,
      exports: providers,
    };
  }
}
