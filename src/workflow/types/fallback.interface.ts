export type TFallbackHandler<T, Event = string> = <P>(
  entity: T,
  event: Event,
  payload?: P | T | object | string,
) => Promise<T>;
