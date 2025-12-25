import { NestFactory } from '@nestjs/core';
import { type SQSHandler } from 'aws-lambda';
import { OrderModule } from '../order/order.module';
import { LambdaEventHandler } from 'serverless-workflow/adapter';

const app = await NestFactory.createApplicationContext(OrderModule);
await app.init();

export const handler: SQSHandler = async (e, c, cb) => {
  return await LambdaEventHandler(app)(e, c, cb);
};

