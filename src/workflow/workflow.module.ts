import { Module } from '@nestjs/common';

@Module({})
export class WorkflowModule {
  static forRoot(options: any) {
    return {
      module: WorkflowModule,
      controllers: []
    };
  }
}
