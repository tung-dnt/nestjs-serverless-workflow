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

import { BrokerPublisher } from '@/event-bus/types/broker-publisher.interface';
import { Entity, IEntity, OnEvent, Payload, Workflow, WorkflowController, WorkflowModule } from '@/workflow';
import { CacheModule } from '@nestjs/cache-manager';
import { Controller, Inject, Injectable, Logger, Module, Post } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';

/**
 * Order domain types
 */
export enum OrderState {
  CREATED = 'created',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export enum OrderEvent {
  CREATED = 'order.created',
  PROCESSING = 'order.processing',
  SHIPPED = 'order.shipped',
  CANCELLED = 'order.cancelled',
  FAILED = 'order.failed',
}

export interface Order {
  id: string;
  item: string;
  quantity: number;
  price: number;
  status: OrderState;
}

@Injectable()
export class OrderEntityService implements IEntity<Order, OrderState> {
  private store = new Map<string, Order>();

  async create(): Promise<Order> {
    const order: Order = {
      id: randomUUID(),
      quantity: 0,
      item: '',
      price: 0,
      status: OrderState.CREATED,
    };
    this.store.set(String(order.id), order);
    return order;
  }

  async load(urn: string | number): Promise<Order | null> {
    const key = String(urn);
    return this.store.has(key) ? { ...this.store.get(key)! } : null;
  }

  async update(order: Order, status: OrderState): Promise<Order> {
    const id = String(order.id);
    // defensive copy
    const updated: Order = { ...order, status };
    this.store.set(id, updated);
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

  async emit<T>(payload: { topic: string; urn: string | number; payload?: T | object | string }): Promise<void> {
    const { topic, urn, payload: payloadData } = payload;
    this.logger.log(`MockBrokerPublisher emit -> topic: ${topic} key: ${urn} payload: ${JSON.stringify(payloadData)}`);
    // In real implementation, push to Kafka/SQS/etc.
    return;
  }
}

@Workflow<Order, OrderEvent, OrderState>({
  name: 'OrderWorkflow',
  states: {
    finals: [OrderState.SHIPPED, OrderState.CANCELLED],
    idles: [OrderState.CREATED],
    failed: OrderState.FAILED,
  },
  transitions: [
    {
      event: OrderEvent.CREATED,
      from: [OrderState.CREATED],
      to: OrderState.PROCESSING,
      conditions: [], // could add validation conditions
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
  fallback: async (entity: Order, event: string, payload?: any) => {
    // Default fallback: log and return entity unchanged
    // In a real system you might persist an audit entry or schedule a retry
    // Keeping it minimal here:
    // Note: the actual `Workflow` decorator will log using the workflow controller logger
    return entity;
  },
})
export class OrderWorkflow implements WorkflowController<Order, OrderState> {
  readonly logger = new Logger(OrderWorkflow.name);

  constructor(
    readonly entityService: OrderEntityService,
    readonly eventEmitter: EventEmitter2,
    readonly brokerPublisher: MockBrokerPublisher,
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
    await this.brokerPublisher.emit({ topic: 'order.shipment', urn: order.id, payload: { orderId: order.id } });
    return { shippedAt: new Date().toISOString() };
  }

  @OnEvent<Order, OrderState>(OrderEvent.CANCELLED)
  async handleOrderCancel(@Entity() order: Order, @Payload() payload: any) {
    this.logger.log(`handleOrderCancel called for order ${order.id}`);
    // release reserved inventory, refund, etc.
    return { cancelledAt: new Date().toISOString() };
  }
}

@Controller()
export class OrderController {
  constructor(
    private readonly orderEntityService: OrderEntityService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post('orders')
  async createOrder(): Promise<void> {
    const order = await this.orderEntityService.create();
    this.eventEmitter.emit(OrderEvent.CREATED, { urn: order.id, payload: { source: 'api' } });
  }
}

@Module({
  imports: [
    EventEmitterModule.forRoot({ global: true }),
    CacheModule.register({ isGlobal: true }),
    WorkflowModule.register({
      providers: [MockBrokerPublisher, OrderWorkflow, OrderEntityService],
    }),
  ],
  controllers: [OrderController],
})
export class OrderModule {}
