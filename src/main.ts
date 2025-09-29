import { NestFactory } from '@nestjs/core';
import { SQSHandler } from 'aws-lambda';
import { LambdaEventHandler } from './adapter/lambda.adapater';
import { WorkflowEvent } from './event-bus/types/workflow-event.interface';
import { OrderEntityService, OrderEvent, OrderModule } from './examples/order.example';

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

export const handler: SQSHandler = async (e, c, cb) => {
  const app = await NestFactory.createApplicationContext(OrderModule);
  await app.init();
  const orderService = app.get(OrderEntityService);
  const order = await orderService.create();
  const event = {
    ...e,
    body: JSON.stringify({
      Records: [
        {
          body: JSON.stringify({
            topic: OrderEvent.CREATED,
            urn: order.id,
            payload: { source: 'api' },
          } as WorkflowEvent),
        },
      ],
    }),
  };
  console.log(event);
  return await LambdaEventHandler(app)(event, c, cb);
};
