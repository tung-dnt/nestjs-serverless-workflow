import { type IBackoffRetryConfig } from '../types';

const WITH_RETRY_KEY = 'workflow:retry';

export const getRetryKey = (propertyKey: string) => `${WITH_RETRY_KEY}:${propertyKey}`;

export function WithRetry(config: IBackoffRetryConfig) {
  return (_target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(getRetryKey(propertyKey), config, descriptor.value);
    return descriptor;
  };
}
