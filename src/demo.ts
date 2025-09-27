import { NestFactory } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderEntityService, OrderEvent, OrderModule } from './examples/order.example';

const PORT = 3000;

async function bootstrap() {
  const app = await NestFactory.create(OrderModule);
  await app.listen(PORT);
}

(async () => {
  const app = await NestFactory.createApplicationContext(OrderModule);
  await app.init();

  // First create an order entity
  const orderService = app.get(OrderEntityService);
  const order = await orderService.create();

  // Then emit the event with proper structure
  const emitter = app.get(EventEmitter2);
  emitter.emit(OrderEvent.CREATED, { urn: order.id, payload: { a: 'ahihi' } });
})();
