import { LambdaEventHandler, LambdaStepHandler, createLambdaStepHandlers } from '@/adapter/lambda.adapater';
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

describe('LambdaStepHandler', () => {
  let app: INestApplicationContext;
  let mockExecuteStep: ReturnType<typeof mock>;

  beforeEach(async () => {
    mockExecuteStep = mock(async () => ({
      entity: { id: 'test-123', status: 'processing' },
      status: 'processing',
      isFinal: false,
      handlerResult: { processedAt: '2024-01-01T00:00:00Z' },
      event: 'order.created',
    }));

    const mockOrchestratorService = {
      executeStep: mockExecuteStep,
      getRegisteredEvents: mock(() => ['order.created', 'order.processing']),
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

  test('should create step handler function', () => {
    const handler = LambdaStepHandler(app);
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  });

  test('should execute a single step and return result', async () => {
    const handler = LambdaStepHandler(app);

    const input = {
      topic: 'order.created',
      urn: 'test-123',
      payload: { items: ['item1'] },
      attempt: 0,
    };

    const result = await handler(input, {} as Context, () => {});

    expect(result).toBeDefined();
    expect(result!.entity).toEqual({ id: 'test-123', status: 'processing' });
    expect(result!.status).toBe('processing');
    expect(result!.isFinal).toBe(false);
    expect(result!.handlerResult).toEqual({ processedAt: '2024-01-01T00:00:00Z' });
    expect(result!.event).toBe('order.created');

    expect(mockExecuteStep).toHaveBeenCalledTimes(1);
    expect(mockExecuteStep).toHaveBeenCalledWith({
      topic: 'order.created',
      urn: 'test-123',
      payload: { items: ['item1'] },
      attempt: 0,
    });
  });

  test('should default attempt to 0 if not provided', async () => {
    const handler = LambdaStepHandler(app);

    const input = {
      topic: 'order.created',
      urn: 'test-123',
      payload: {},
    };

    await handler(input, {} as Context, () => {});

    expect(mockExecuteStep).toHaveBeenCalledWith({
      topic: 'order.created',
      urn: 'test-123',
      payload: {},
      attempt: 0,
    });
  });
});

describe('createLambdaStepHandlers', () => {
  let app: INestApplicationContext;
  let mockExecuteStep: ReturnType<typeof mock>;

  beforeEach(async () => {
    mockExecuteStep = mock(async () => ({
      entity: { id: 'test-123', status: 'processing' },
      status: 'processing',
      isFinal: false,
      handlerResult: {},
      event: 'order.created',
    }));

    const mockOrchestratorService = {
      executeStep: mockExecuteStep,
      getRegisteredEvents: mock(() => ['order.created', 'order.processing', 'order.shipped']),
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

  test('should create handlers map with all registered events', () => {
    const handlers = createLambdaStepHandlers(app);

    expect(handlers).toBeDefined();
    expect(handlers instanceof Map).toBe(true);
    expect(handlers.size).toBe(3);
    expect(handlers.has('order.created')).toBe(true);
    expect(handlers.has('order.processing')).toBe(true);
    expect(handlers.has('order.shipped')).toBe(true);
  });

  test('should create callable handlers for each event', async () => {
    const handlers = createLambdaStepHandlers(app);
    const orderCreatedHandler = handlers.get('order.created');

    expect(orderCreatedHandler).toBeDefined();
    expect(typeof orderCreatedHandler).toBe('function');

    const result = await orderCreatedHandler!({ urn: 'test-123', payload: {} }, {} as Context, () => {});

    expect(result).toBeDefined();
    expect(mockExecuteStep).toHaveBeenCalledWith({
      topic: 'order.created',
      urn: 'test-123',
      payload: {},
      attempt: 0,
    });
  });

  test('handlers should use correct event name automatically', async () => {
    const handlers = createLambdaStepHandlers(app);
    const orderProcessingHandler = handlers.get('order.processing');

    await orderProcessingHandler!({ urn: 'test-456', payload: { data: 'test' } }, {} as Context, () => {});

    expect(mockExecuteStep).toHaveBeenCalledWith({
      topic: 'order.processing',
      urn: 'test-456',
      payload: { data: 'test' },
      attempt: 0,
    });
  });
});
