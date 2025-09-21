import { NestFactory } from '@nestjs/core';
import { LambdaEventHandler } from './adapter/lambda.adapater';
import { OrderModule } from './examples/order.example';

const app = await NestFactory.createApplicationContext(OrderModule);

export const handler = LambdaEventHandler(app);
