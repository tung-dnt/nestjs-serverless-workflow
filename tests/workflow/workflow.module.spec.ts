import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowModule } from '../../src/workflow/workflow.module';

describe('WorkflowModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        WorkflowModule.register({
          entities: [],
          workflows: [],
          brokers: [],
        }),
      ],
    }).compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  afterEach(async () => {
    await module.close();
  });
});

