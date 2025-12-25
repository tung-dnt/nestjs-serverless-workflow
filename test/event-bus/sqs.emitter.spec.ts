import { SqsEmitter } from '@/event-bus/sqs/sqs.emitter';
import type { IWorkflowEvent } from '@/event-bus/types';
import { beforeEach, describe, expect, test } from 'bun:test';

describe('SqsEmitter', () => {
  let emitter: SqsEmitter;

  beforeEach(() => {
    emitter = new SqsEmitter();
  });

  test('should be defined', () => {
    expect(emitter).toBeDefined();
  });

  test('should implement IBrokerPublisher interface', () => {
    expect(emitter.emit).toBeDefined();
    expect(typeof emitter.emit).toBe('function');
  });

  test('should emit workflow event', async () => {
    const event: IWorkflowEvent<any> = {
      urn: 'test-123',
      attempt: 1,
      topic: 'test.event',
      payload: { data: 'test' },
    };

    expect(emitter.emit(event)).resolves.toBeUndefined();
  });
});
