import { describe, test, expect } from 'bun:test';
import { UnretriableException } from '@/exception/unretriable.exception';

describe('UnretriableException', () => {
  test('should create an exception with message', () => {
    const message = 'Test error message';
    const exception = new UnretriableException(message);

    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.name).toBe('UnretriableException');
  });

  test('should be throwable', () => {
    const message = 'Test error';
    expect(() => {
      throw new UnretriableException(message);
    }).toThrow(UnretriableException);
  });

  test('should be catchable as Error', () => {
    try {
      throw new UnretriableException('test');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UnretriableException);
    }
  });
});
