import { UnretriableException } from '../../packages/exception/unretriable.exception';

describe('UnretriableException', () => {
  it('should create an exception with message', () => {
    const message = 'Test error message';
    const exception = new UnretriableException(message);

    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.name).toBe('UnretriableException');
  });

  it('should be throwable', () => {
    const message = 'Test error';
    expect(() => {
      throw new UnretriableException(message);
    }).toThrow(UnretriableException);
  });

  it('should be catchable as Error', () => {
    try {
      throw new UnretriableException('test');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UnretriableException);
    }
  });
});

