import { LambdaEventHandler } from '@/adapter/lambda.adapater';
import { OrchestratorService } from '@/core';
import { type INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Context, SQSEvent } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

describe('LambdaEventHandler', () => {
  let app: INestApplicationContext;

  beforeEach(async () => {
    const mockOrchestratorService = {
      transit: mock(async () => {}),
    };

    const module = await Test.createTestingModule({
      providers: [
        {
          provide: OrchestratorService,
          useValue: mockOrchestratorService,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  test('should create handler function', () => {
    const handler = LambdaEventHandler(app);
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  });

  test('should handle SQS events', async () => {
    const handler = LambdaEventHandler(app);

    const mockEvent: SQSEvent = {
      Records: [
        {
          messageId: 'test-message-id',
          body: JSON.stringify({
            urn: 'test-123',
            event: 'test.event',
            payload: {},
          }),
          receiptHandle: 'test-receipt',
          attributes: {} as any,
          messageAttributes: {},
          md5OfBody: 'test-md5',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:test',
          awsRegion: 'us-east-1',
        },
      ],
    };

    const mockContext: Context = {
      getRemainingTimeInMillis: () => 30000,
    } as Context;

    const result = await handler(mockEvent, mockContext, () => {});

    expect(result).toBeDefined();
    if (result) {
      expect(result.batchItemFailures).toBeDefined();
      expect(Array.isArray(result.batchItemFailures)).toBe(true);
    }
  });
});
