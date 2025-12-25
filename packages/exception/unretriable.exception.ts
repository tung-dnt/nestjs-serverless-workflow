export class UnretriableException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnretriableException';
  }
}
