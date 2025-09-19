import { Module, DynamicModule, Provider } from '@nestjs/common';

@Module({})
export class WorkflowModule {
  static register(options: { imports?: any[]; providers: Provider[] }): DynamicModule {
    const imports = options.imports ?? [];

    return {
      module: WorkflowModule,
      imports,
      providers: options.providers ?? [],
      exports: options.providers ?? [],
    };
  }
}
