import type { IWorkflowEntity } from '@/workflow';
import { OrchestratorService } from '@/workflow';
import { Controller, Inject, Post } from '@nestjs/common';

import { ORDER_WORKFLOW_ENTITY, OrderEvent } from './order.constant';

@Controller('orders')
export class OrderController {
  constructor(
    @Inject(ORDER_WORKFLOW_ENTITY) private readonly entity: IWorkflowEntity,
    private readonly router: OrchestratorService,
  ) {}

  @Post()
  async createEntity() {
    const entity = await this.entity.create();
    this.router.transit({ topic: OrderEvent.CREATED, urn: entity.id, attempt: 0, payload: { approved: true } }); // auto-approve for demo
    return entity;
  }
}
