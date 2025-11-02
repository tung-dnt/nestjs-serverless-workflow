import { NestFactory } from '@nestjs/core';
import { OrderModule } from './examples/order/order.module';

(async () => {
  const app = await NestFactory.create(OrderModule);
  app.listen(3000);
})();
