import { SqsEmitter } from '../../packages/event-bus/sqs/sqs.emitter';
import type { IWorkflowEvent } from '../../packages/event-bus/types';

describe('SqsEmitter', () => {
  let emitter: SqsEmitter;

  beforeEach(() => {
    emitter = new SqsEmitter();
  });

  it('should be defined', () => {
    expect(emitter).toBeDefined();
  });

  it('should implement IBrokerPublisher interface', () => {
    expect(emitter.emit).toBeDefined();
    expect(typeof emitter.emit).toBe('function');
  });

  it('should emit workflow event', async () => {
    const event: IWorkflowEvent<any> = {
      urn: 'test-123',
      attempt: 1,
      topic: 'test.event',
      payload: { data: 'test' },
    };

    await expect(emitter.emit(event)).resolves.toBeUndefined();
  });
});

