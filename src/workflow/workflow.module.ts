import { BROKER_PUBLISHER, BrokerPublisher } from '@/event-bus/types/broker-publisher.interface';
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { StateRouter } from './router.service';
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

    // Create broker provider with token
    const brokerProvider: Provider = {
      provide: BROKER_PUBLISHER,
      useClass: broker as any,
    };

    const providers = [...(entities ?? []), ...(workflows ?? []), brokerProvider, StateRouter];

    return {
      module: WorkflowModule,
      imports: [DiscoveryModule, ...(imports ?? [])],
      providers: providers,
      exports: providers,
    };
  }
}
