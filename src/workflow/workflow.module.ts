import { DynamicModule, Module, Provider } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowDefinition } from './types/workflow-definition.interface';

@Module({})
export class WorkflowModule {
  static forRoot(options: any): DynamicModule {
    return {
      module: WorkflowModule,
      controllers: []
    };
  }

  static register<T, P, Event, State>(options: {
    name: string;
    definition: WorkflowDefinition<T, P, Event, State>;
  }): DynamicModule {
    const workflowServiceProvider: Provider = {
      provide: options.name,
      useFactory: () => {
        return new WorkflowService(options.definition);
      },
    };

    const workflowServiceClassProvider: Provider = {
      provide: WorkflowService,
      useFactory: () => {
        return new WorkflowService(options.definition);
      },
    };

    return {
      module: WorkflowModule,
      providers: [workflowServiceProvider, workflowServiceClassProvider],
      exports: [workflowServiceProvider, workflowServiceClassProvider],
    };
  }
}
