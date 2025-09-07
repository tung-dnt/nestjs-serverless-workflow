import { Module, DynamicModule, Provider } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({})
export class WorkflowModule {
  static register(options: { imports?: any[]; providers: Provider[] }): DynamicModule {
    const imports = [EventEmitterModule.forRoot(), ...(options.imports ?? [])];

    return {
      module: WorkflowModule,
      imports,
      providers: [...(options.providers ?? [])],
    };
  }
}
