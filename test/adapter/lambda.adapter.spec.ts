import { LambdaEventHandler } from '@/adapter/lambda.adapater';

describe('LambdaEventHandler (SQS)', () => {
  const makeSqsEvent = (records: Array<{ messageId: string; body: string }>) =>
    ({
      Records: records.map((r) => ({
        messageId: r.messageId,
        body: r.body,
      })),
    }) as any;

  const makeContext = (remainingMs: number) =>
    ({
      getRemainingTimeInMillis: jest.fn(() => remainingMs),
    }) as any;

  let eventEmitterMock: { emitAsync: jest.Mock };
  let appMock: { get: jest.Mock };

  beforeEach(() => {
    eventEmitterMock = {
      emitAsync: jest.fn(),
    };

    appMock = {
      get: jest.fn().mockImplementation(() => eventEmitterMock),
    } as any;

    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should process all messages successfully and return empty batchItemFailures', async () => {
    // Arrange
    const handler = LambdaEventHandler(appMock as any);
    const event = makeSqsEvent([
      {
        messageId: 'msg-1',
        body: JSON.stringify({
          topic: 'order.created',
          urn: 'urn:1',
          payload: { id: 1 },
        }),
      },
      {
        messageId: 'msg-2',
        body: JSON.stringify({
          topic: 'order.updated',
          urn: 'urn:2',
          payload: { id: 2 },
        }),
      },
    ]);

    // Large remaining time so shutdown won't trigger before processing completes
    const context = makeContext(60_000);

    eventEmitterMock.emitAsync.mockResolvedValueOnce(Promise.resolve([]));
    eventEmitterMock.emitAsync.mockResolvedValueOnce(Promise.resolve([]));

    // Act
    const result = await handler(event, context, undefined as any);

    // Assert
    expect(appMock.get).toHaveBeenCalled();
    expect(eventEmitterMock.emitAsync).toHaveBeenCalledTimes(2);
    expect(eventEmitterMock.emitAsync).toHaveBeenNthCalledWith(1, 'order.created', {
      urn: 'urn:1',
      payload: { id: 1 },
    });
    expect(eventEmitterMock.emitAsync).toHaveBeenNthCalledWith(2, 'order.updated', {
      urn: 'urn:2',
      payload: { id: 2 },
    });
    expect(result).toEqual({ batchItemFailures: [] });
  });

  it('should mark a message as failed when JSON.parse throws', async () => {
    // Arrange
    const handler = LambdaEventHandler(appMock as any);
    const event = makeSqsEvent([
      {
        messageId: 'bad-msg',
        body: 'this-is-not-json',
      },
    ]);
    const context = makeContext(60_000);

    // Act
    const result = await handler(event, context, undefined as any);

    // Assert
    expect(eventEmitterMock.emitAsync).not.toHaveBeenCalled();
    expect((result as any).batchItemFailures).toEqual([{ itemIdentifier: 'bad-msg' }]);
  });

  it('should mark a message as failed when emitAsync rejects', async () => {
    // Arrange
    const handler = LambdaEventHandler(appMock as any);
    const event = makeSqsEvent([
      {
        messageId: 'emit-fail-msg',
        body: JSON.stringify({
          topic: 'order.failed',
          urn: 'urn:fail',
          payload: { reason: 'oops' },
        }),
      },
    ]);
    const context = makeContext(60_000);

    eventEmitterMock.emitAsync.mockRejectedValueOnce(new Error('emit error'));

    // Act
    const result = await handler(event, context, undefined as any);

    // Assert
    expect(eventEmitterMock.emitAsync).toHaveBeenCalledTimes(1);
    expect((result as any).batchItemFailures).toEqual([{ itemIdentifier: 'emit-fail-msg' }]);
  });

  it('should gracefully shutdown and mark in-flight messages for retry when time is up', async () => {
    // Arrange
    jest.useFakeTimers({ legacyFakeTimers: false });

    const handler = LambdaEventHandler(appMock as any);
    const event = makeSqsEvent([
      {
        messageId: 'slow-msg',
        body: JSON.stringify({
          topic: 'order.slow',
          urn: 'urn:slow',
          payload: { delay: true },
        }),
      },
    ]);

    // Make remaining time just above 5000ms so safety window is very small (e.g. 1ms)
    // safetyWindowMs = 5001 - 5000 = 1 ms
    const context = makeContext(5001);

    // Never resolve emitAsync to simulate a long-running handler
    eventEmitterMock.emitAsync.mockReturnValueOnce(new Promise(() => {}));

    // Act: invoke handler, then advance time to trigger shutdown
    const promise = handler(event, context, undefined as any);

    // Trigger the shutdown timer (1ms)
    await Promise.resolve(); // ensure any pending microtasks run before timers
    jest.advanceTimersByTime(1);

    const result = await promise;

    // Assert
    expect(eventEmitterMock.emitAsync).toHaveBeenCalledTimes(1);
    expect((result as any).batchItemFailures).toEqual([{ itemIdentifier: 'slow-msg' }]);

    jest.useRealTimers();
  });
});
