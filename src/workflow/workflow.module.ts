import { IBrokerPublisher } from '@/event-bus';
import { OchestratorService, StateRouterHelperFactory } from '@/workflow';
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

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

    const providers = [...entities, ...workflows, ...brokers, StateRouterHelperFactory, OchestratorService];

    return {
      module: WorkflowModule,
      imports: [DiscoveryModule, ...(imports ?? [])],
      providers: providers,
      exports: providers,
    };
  }
}
