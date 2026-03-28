import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { OrchestratorService, StateRouterHelperFactory } from '@/core';

import type { IWorkflowEntity } from './types';
import { type PayloadValidator, WORKFLOW_PAYLOAD_VALIDATOR } from './types';

/**
 * Dynamic NestJS module that bootstraps the workflow engine.
 *
 * Call {@link WorkflowModule.register} to supply entity services, workflow
 * classes, and any extra providers. The module sets up {@link OrchestratorService}
 * and the {@link StateRouterHelperFactory} automatically.
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     WorkflowModule.register({
 *       entities: [{ provide: 'entity.order', useClass: OrderEntityService }],
 *       workflows: [OrderWorkflow],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class WorkflowModule {
  /**
   * Register workflows with the module.
   *
   * @param options.imports   - Additional NestJS modules to import
   * @param options.entities  - Providers for {@link IWorkflowEntity} implementations (keyed by injection token)
   * @param options.workflows - Workflow classes decorated with {@link Workflow}
   * @param options.providers - Extra providers to include in the module
   */
  static register(options: {
    imports?: any[];
    entities: Provider<IWorkflowEntity>[];
    workflows: Provider[];
    providers?: Provider[];
    /** Optional validation function for `@Payload(schema)` decorated parameters. */
    payloadValidator?: PayloadValidator;
  }): DynamicModule {
    const { imports, entities, workflows, providers: extraProviders, payloadValidator } = options;

    const providers = [
      ...entities,
      ...workflows,
      ...(extraProviders ?? []),
      { provide: WORKFLOW_PAYLOAD_VALIDATOR, useValue: payloadValidator ?? null },
      StateRouterHelperFactory,
      OrchestratorService,
    ];

    return {
      module: WorkflowModule,
      imports: [DiscoveryModule, ...(imports ?? [])],
      providers: providers,
      exports: providers,
    };
  }
}
