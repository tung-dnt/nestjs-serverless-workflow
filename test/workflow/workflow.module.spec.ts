import { WorkflowModule } from '@/workflow/workflow.module';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

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

  test('should be defined', () => {
    expect(module).toBeDefined();
  });

  afterEach(async () => {
    await module.close();
  });
});
