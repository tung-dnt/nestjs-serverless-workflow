import { IWorkflowEntity } from '@/workflow';
import { StateRouter } from '@/workflow/router.service';
import { Controller, Inject, Post } from '@nestjs/common';

import { ORDER_WORKFLOW_ENTITY, OrderEvent } from './order.constant';

@Controller('orders')
export class OrderController {
  constructor(
    @Inject(ORDER_WORKFLOW_ENTITY) private readonly entity: IWorkflowEntity,
    private readonly router: StateRouter,
  ) {}

  @Post()
  async createEntity() {
    const entity = await this.entity.create();
    this.router.transit(OrderEvent.CREATED, { urn: entity.id, attempt: 0, payload: { approved: true } }); // auto-approve for demo
    return entity;
  }
}
