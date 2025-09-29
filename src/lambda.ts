import { NestFactory } from '@nestjs/core';
import { SQSHandler } from 'aws-lambda';
import { LambdaEventHandler } from './adapter/lambda.adapater';
import { OrderModule } from './examples/order.example';

export const handler: SQSHandler = async (e, c, cb) => {
  const app = await NestFactory.createApplicationContext(OrderModule);
  await app.init();
  return await LambdaEventHandler(app)(e, c, cb);
};
