/**
 * Example Order workflow, entity service, broker and module
 *
 * This file demonstrates an example usage of the workflow primitives contained in
 * `src/workflow/*` with:
 * - a simple in-memory `Order` entity service implementing the `Entity<T,State>` interface
 * - a minimal `BrokerPublisher` implementation (mock)
 * - an example `OrderWorkflow` controller using the `@Workflow` and `@OnEvent` decorators
 * - an `OrderModule` that wires everything up for Nest
 *
 * NOTE:
 * - This file is intended as an example only and uses an in-memory map for persistence.
 * - In production you'd replace the in-memory service with a database-backed one and
 *   the mock broker with a real message broker publisher.
 */

import { BROKER_PUBLISHER, BrokerPublisher } from '@/event-bus/types/broker-publisher.interface';
import { WorkflowEvent } from '@/event-bus/types/workflow-event.interface';
import { Entity, IEntity, OnEvent, Payload, Workflow, WorkflowModule } from '@/workflow';
import { Fallback } from '@/workflow/decorators/fallback.decorator';
import { StateRouter } from '@/workflow/router.service';
import { Controller, Inject, Injectable, Logger, Module, Post } from '@nestjs/common';
import { GetItemCommand, PutItemCommand } from 'dynamodb-toolbox';
import { uuidv7 } from 'uuidv7';
import { Order, OrderEntity, OrderState } from './dynamodb/order.table';

export enum OrderEvent {
  CREATED = 'order.created',
  PROCESSING = 'order.processing',
  SHIPPED = 'order.shipped',
  CANCELLED = 'order.cancelled',
  FAILED = 'order.failed',
}

const ORDER_WORKFLOW_ENTITY = 'Order Workflow';

@Injectable()
export class OrderEntityService implements IEntity<Order, OrderState> {
  async create(): Promise<Order> {
    const order: Order = {
      id: uuidv7(),
      quantity: 0,
      item: 'ahihihi',
      price: 0,
      status: OrderState.CREATED,
    };
    await OrderEntity.build(PutItemCommand).item(order).send();
    return order;
  }

  async load(urn: string): Promise<Order | null> {
    const { Item } = await OrderEntity.build(GetItemCommand).key({ id: urn }).send();
    if (!Item) throw new Error(`Order ${urn} not found!`);
    return Item;
  }

  async update(order: Order, status: OrderState): Promise<Order> {
    const updated: Order = { ...order, status };
    await OrderEntity.build(PutItemCommand).item(updated).send();
    return updated;
  }

  status(order: Order): OrderState {
    return order.status;
  }

  urn(order: Order): string | number {
    return order.id;
  }
}

/**
 * Minimal mock broker publisher that logs emitted workflow events.
 */
@Injectable()
export class MockBrokerPublisher implements BrokerPublisher {
  private readonly logger = new Logger(MockBrokerPublisher.name);

  async emit<T>(payload: WorkflowEvent<T>): Promise<void> {
    const { topic, urn, payload: payloadData } = payload;
    this.logger.log(`MockBrokerPublisher emit -> topic: ${topic} key: ${urn} payload: ${JSON.stringify(payloadData)}`);
    // In real implementation, push to Kafka/SQS/etc.
  }
  async retry<T>(payload: WorkflowEvent<T>) {
    const { topic, urn, payload: payloadData } = payload;
    this.logger.log(`MockBrokerPublisher RETRY -> topic: ${topic} key: ${urn} payload: ${JSON.stringify(payloadData)}`);
    // In real implementation, push to Kafka/SQS/etc.
  }
}

@Workflow<Order, OrderEvent, OrderState>({
  name: 'OrderWorkflow',
  states: {
    finals: [OrderState.SHIPPED, OrderState.CANCELLED],
    idles: [OrderState.CREATED], // Make sure to add conditions to make transition from idle to non-idle states
    failed: OrderState.FAILED,
  },
  transitions: [
    {
      event: OrderEvent.CREATED,
      from: [OrderState.CREATED],
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
      from: [OrderState.CREATED, OrderState.PROCESSING],
      to: OrderState.CANCELLED,
      conditions: [(entity) => false], // can't cancel if already shipped
    },
  ],
  retry: {
    maxAttempts: 3,
  },
  entityService: ORDER_WORKFLOW_ENTITY,
})
export class OrderWorkflow {
  private readonly logger = new Logger(OrderWorkflow.name);

  constructor(@Inject(BROKER_PUBLISHER) readonly brokerPublisher: BrokerPublisher) {}

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
  async handleOrderCancel(@Entity() order: Order, @Payload() payload: any) {
    this.logger.log(`handleOrderCancel called for order ${order.id}`);
    // release reserved inventory, refund, etc.
    return { cancelledAt: new Date().toISOString() };
  }

  @Fallback
  async fallback(entity: Order, event: string, payload?: any) {
    this.logger.warn(
      `Fallback called for order ${entity.id} on event ${event} with payload ${JSON.stringify(payload)}`,
    );
    return entity;
  }
}

@Controller('orders')
class OrderController {
  constructor(
    @Inject(ORDER_WORKFLOW_ENTITY) private readonly entity: IEntity,
    private readonly router: StateRouter,
  ) {}

  @Post()
  async createEntity() {
    const entity = await this.entity.create();
    this.router.transit(OrderEvent.CREATED, { urn: entity.id, attempt: 0, payload: { approved: true } }); // auto-approve for demo
    return entity;
  }
}

@Module({
  imports: [
    WorkflowModule.register({
      entities: [{ provide: ORDER_WORKFLOW_ENTITY, useClass: OrderEntityService }],
      workflows: [OrderWorkflow],
      broker: { provide: BROKER_PUBLISHER, useClass: MockBrokerPublisher },
    }),
  ],
  controllers: [OrderController],
})
export class OrderModule {}
