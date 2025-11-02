import { IBrokerPublisher } from '@/event-bus/types/broker-publisher.interface';
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { StateRouterHelperFactory } from './router.factory';
import { OchestratorService } from './ochestrator.service';
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
