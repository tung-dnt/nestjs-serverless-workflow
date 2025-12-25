export function Entity(): ParameterDecorator {
  return (target: Object, propertyKey?: string | symbol, parameterIndex?: number) => {
    if (!propertyKey || parameterIndex === undefined) throw new Error('Entity decorator can only be used on method parameters');
    const existing: Array<any> = Reflect.getOwnMetadata('workflow:params', target, propertyKey) || [];
    existing.push({ index: parameterIndex, type: 'entity' });
    Reflect.defineMetadata('workflow:params', existing, target, propertyKey);
  };
}

export function Payload<P>(dto?: P): ParameterDecorator {
  return (target: Object, propertyKey?: string | symbol, parameterIndex?: number) => {
    if (!propertyKey || parameterIndex === undefined) throw new Error('Payload decorator can only be used on method parameters');
    const existing: Array<any> = Reflect.getOwnMetadata('workflow:params', target, propertyKey) || [];
    existing.push({ index: parameterIndex, type: 'payload', dto });
    Reflect.defineMetadata('workflow:params', existing, target, propertyKey);
  };
}
