import { Test } from '@nestjs/testing';
import { type INestApplicationContext } from '@nestjs/common';
import { LambdaEventHandler } from '../../packages/adapter/lambda.adapater';
import type { SQSEvent, Context } from 'aws-lambda';

describe('LambdaEventHandler', () => {
  let app: INestApplicationContext;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        // Add necessary mock providers
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should create handler function', () => {
    const handler = LambdaEventHandler(app);
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  });

  it('should handle SQS events', async () => {
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

