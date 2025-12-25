import { NestFactory } from '@nestjs/core';
import { OrderModule } from './order/order.module';

(async () => {
  const app = await NestFactory.create(OrderModule);
  app.listen(3000);
})();
