import { NestFactory } from '@nestjs/core';
import { type SQSHandler } from 'aws-lambda';
import { OrderModule } from '../examples/order/order.module';
import { LambdaEventHandler } from './adapter/lambda.adapater';

const app = await NestFactory.createApplicationContext(OrderModule);
await app.init();

export const handler: SQSHandler = async (e, c, cb) => {
  return await LambdaEventHandler(app)(e, c, cb);
};
