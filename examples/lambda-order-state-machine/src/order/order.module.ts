import { Module } from '@nestjs/common';
import { WorkflowModule } from 'nestjs-serverless-workflow/workflow';

import { MockBrokerPublisher } from '../broker/mock-broker.service';
import { OrderEntityService } from './order-entity.service';
import { ORDER_WORKFLOW_BROKER, ORDER_WORKFLOW_ENTITY } from './order.constant';
import { OrderController } from './order.controller';
import { OrderWorkflow } from './order.workflow';

@Module({
  imports: [
    WorkflowModule.register({
      entities: [{ provide: ORDER_WORKFLOW_ENTITY, useClass: OrderEntityService }],
      workflows: [OrderWorkflow],
      brokers: [{ provide: ORDER_WORKFLOW_BROKER, useClass: MockBrokerPublisher }],
      providers: [],
    }),
  ],
  controllers: [OrderController],
})
export class OrderModule {}
