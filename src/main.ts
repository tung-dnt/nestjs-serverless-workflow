import { NestFactory } from '@nestjs/core';
import { LambdaEventHandler } from './adapter/lambda.adapater';
import { OrderModule } from './examples/order.example';
import { SQSHandler } from 'aws-lambda';

// (async () => {
//   const app = await NestFactory.createApplicationContext(OrderModule);
//   await app.init();
//
//   // First create an order entity
//   const orderService = app.get(OrderEntityService);
//   const order = await orderService.create();
//   return await LambdaEventHandler(app)(
//     {
//       Records: [
//         {
//           body: JSON.stringify({
//             topic: OrderEvent.CREATED,
//             urn: order.id,
//             payload: { source: 'api' },
//           } as WorkflowEvent),
//         },
//       ],
//     },
//     { getRemainingTimeInMillis: () => 100000 },
//   );
// })();

export const handler: SQSHandler = async (e, c, cb) => {
  const app = await NestFactory.createApplicationContext(OrderModule);
  await app.init();
  return await LambdaEventHandler(app)(e, c, cb);
};
