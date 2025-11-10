import { IBrokerPublisher } from '@/event-bus';
import { Entity, OnDefault, OnEvent, Payload, Workflow } from '@/workflow';
import { Inject, Logger } from '@nestjs/common';

import { Order, OrderState } from '../dynamodb/order.table';
import { ORDER_WORKFLOW_BROKER, ORDER_WORKFLOW_ENTITY, OrderEvent } from './order.constant';

@Workflow<Order, OrderEvent, OrderState>({
  name: 'OrderWorkflow',
  states: {
    finals: [OrderState.SHIPPED, OrderState.CANCELLED],
    idles: [OrderState.PENDING], // Make sure to add conditions to make transition from idle to non-idle states
    failed: OrderState.FAILED,
  },
  transitions: [
    {
      event: OrderEvent.CREATED,
      from: [OrderState.PENDING],
      to: OrderState.PROCESSING,
      conditions: [(_entity: Order, payload: { approved: boolean }) => payload.approved], // idle for approval, only run workflow once matched conditions
    },
    {
      event: OrderEvent.PROCESSING,
      from: [OrderState.PROCESSING],
      to: OrderState.SHIPPED,
    },
    {
      event: OrderEvent.CANCELLED,
      from: [OrderState.PENDING, OrderState.PROCESSING],
      to: OrderState.CANCELLED,
      conditions: [(_entity) => false], // can't cancel if already shipped
    },
  ],
  retry: {
    maxAttempts: 3,
  },
  entityService: ORDER_WORKFLOW_ENTITY,
  brokerPublisher: ORDER_WORKFLOW_BROKER,
})
export class OrderWorkflow {
  private readonly logger = new Logger(OrderWorkflow.name);

  constructor(
    @Inject(ORDER_WORKFLOW_BROKER)
    private readonly brokerPublisher: IBrokerPublisher,
  ) {}

  @OnEvent<Order, OrderState>(OrderEvent.CREATED)
  async handleOrderCreated(@Entity() order: Order, @Payload() payload: any) {
    this.logger.log(`handleOrderCreated called for order ${order.id}, source=${JSON.stringify(payload)}`);
    // example action: charge payment, validate items, etc.
    // We'll just log and return some payload used by next transition checks
    return { processedAt: new Date().toISOString() };
  }

  @OnEvent<Order, OrderState>(OrderEvent.PROCESSING)
  async handleOrderProcessing(@Entity() order: Order, @Payload() payload: any) {
    this.logger.log(`handleOrderProcessing called for order ${order.id} payload=${JSON.stringify(payload)}`);
    // example action: prepare shipment, notify warehouse, etc.
    return { processingAt: new Date().toISOString() };
  }

  @OnEvent<Order, OrderState>(OrderEvent.SHIPPED)
  async handleOrderProcessed(@Entity() order: Order, @Payload() payload: any) {
    this.logger.log(`handleOrderProcessed called for order ${order.id} payload=${JSON.stringify(payload)}`);
    // perhaps notify customer, create shipment, etc.
    // Optionally publish to broker:
    await this.brokerPublisher.emit({
      topic: 'order.shipment',
      attempt: 0,
      urn: order.id,
      payload: { orderId: order.id },
    });
    return { shippedAt: new Date().toISOString() };
  }

  @OnEvent<Order, OrderState>(OrderEvent.CANCELLED)
  async handleOrderCancel(@Entity() order: Order) {
    this.logger.log(`handleOrderCancel called for order ${order.id}`);
    // release reserved inventory, refund, etc.
    return { cancelledAt: new Date().toISOString() };
  }

  @OnDefault
  async fallback(entity: Order, event: string, payload?: any) {
    this.logger.warn(
      `Fallback called for order ${entity.id} on event ${event} with payload ${JSON.stringify(payload)}`,
    );
    return entity;
  }
}
