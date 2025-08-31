import { Module } from '@nestjs/common';

@Module({})
export class WorkflowModule {
  static forRoot([...........]) {
    return {
      module: WorkflowModule,
      controllers: [...........]
    };
  }
}
