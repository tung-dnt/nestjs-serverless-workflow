import { NestFactory } from '@nestjs/core';
import { OrderModule } from './examples/order.example';

(async () => {
  const app = await NestFactory.create(OrderModule);
  app.listen(3000);
})();
