import { Injectable, Logger } from '@nestjs/common';
import { Workflow, OnEvent, OnCompensation, Entity, Payload, WithRetry, RollbackStrategy } from '@/workflow';

// ==================== Domain Types ====================

interface Order {
  id: string;
  status: OrderStatus;
  customerId: string;
  amount: number;
  items: OrderItem[];
  reservationId?: string;
  transactionId?: string;
}

interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

enum OrderStatus {
  PENDING = 'pending',
  INVENTORY_RESERVED = 'inventory_reserved',
  PAYMENT_PROCESSED = 'payment_processed',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// ==================== Workflow Service ====================

/**
 * Example Order Workflow with SAGA Pattern
 *
 * This demonstrates a complete order processing workflow with:
 * 1. Inventory reservation
 * 2. Payment processing
 * 3. Order completion
 *
 * If any step fails, compensations are executed in reverse order:
 * - Refund payment if processed
 * - Release inventory if reserved
 */
@Injectable()
@Workflow({
  name: 'order-workflow',
  entityService: 'OrderEntityService',
  brokerPublisher: 'OrderBrokerPublisher',
  states: {
    finals: [OrderStatus.COMPLETED, OrderStatus.FAILED],
    failed: OrderStatus.FAILED,
    idles: [],
  },
  transitions: [
    {
      from: [OrderStatus.PENDING],
      to: OrderStatus.INVENTORY_RESERVED,
      event: 'order.reserve_inventory',
    },
    {
      from: [OrderStatus.INVENTORY_RESERVED],
      to: OrderStatus.PAYMENT_PROCESSED,
      event: 'order.process_payment',
    },
    {
      from: [OrderStatus.PAYMENT_PROCESSED],
      to: OrderStatus.COMPLETED,
      event: 'order.complete',
    },
  ],
  saga: {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    timeout: 30000,
    failFast: true,
    historyService: 'OrderSagaHistoryService',
  },
})
export class OrderWorkflowService {
  private readonly logger = new Logger(OrderWorkflowService.name);

  constructor() // Inject your services here
  // private readonly inventoryService: InventoryService,
  // private readonly paymentService: PaymentService,
  // private readonly notificationService: NotificationService,
  {}

  // ==================== Forward Handlers ====================

  /**
   * Step 1: Reserve inventory for the order
   * This is automatically retried up to 3 times with exponential backoff
   */
  @OnEvent('order.reserve_inventory')
  @WithRetry({
    maxAttempts: 3,
    initialDelay: 1000,
    handler: 'ExponentialBackoffRetryHandler',
  })
  async reserveInventory(@Entity() order: Order, @Payload() payload: { items: OrderItem[] }): Promise<any> {
    this.logger.log(`[SAGA STEP 1] Reserving inventory for order ${order.id}`);

    // Call inventory service to reserve stock
    // const reservation = await this.inventoryService.reserve({
    //   orderId: order.id,
    //   items: payload.items,
    // });

    // Simulate inventory reservation
    const reservationId = `RES-${Date.now()}`;

    this.logger.log(`Inventory reserved with ID: ${reservationId}`);

    // Return data to be passed to next step
    return {
      reserved: true,
      reservationId,
      items: payload.items,
    };
  }

  /**
   * Compensation for Step 1: Release reserved inventory
   * This is called if any subsequent step fails
   */
  @OnCompensation('order.reserve_inventory', {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    historyService: 'OrderSagaHistoryService',
  })
  async compensateReserveInventory(
    @Entity() order: Order,
    @Payload() payload: { reservationId: string },
  ): Promise<void> {
    this.logger.warn(`[SAGA COMPENSATION 1] Releasing inventory for order ${order.id}`);

    // Call inventory service to release the reservation
    // await this.inventoryService.release(payload.reservationId);

    this.logger.log(`Inventory released for reservation: ${payload.reservationId}`);
  }

  /**
   * Step 2: Process payment for the order
   * This is automatically retried up to 3 times
   */
  @OnEvent('order.process_payment')
  @WithRetry({
    maxAttempts: 3,
    initialDelay: 2000,
    handler: 'ExponentialBackoffRetryHandler',
  })
  async processPayment(
    @Entity() order: Order,
    @Payload() payload: { amount: number; reservationId: string },
  ): Promise<any> {
    this.logger.log(`[SAGA STEP 2] Processing payment for order ${order.id}`);

    // Call payment service to charge the customer
    // const transaction = await this.paymentService.charge({
    //   customerId: order.customerId,
    //   amount: payload.amount,
    //   orderId: order.id,
    //   metadata: {
    //     reservationId: payload.reservationId,
    //   },
    // });

    // Simulate payment processing
    const transactionId = `TXN-${Date.now()}`;

    this.logger.log(`Payment processed with transaction ID: ${transactionId}`);

    // Return data to be passed to next step
    return {
      charged: true,
      transactionId,
      amount: payload.amount,
      reservationId: payload.reservationId,
    };
  }

  /**
   * Compensation for Step 2: Refund the payment
   * This is called if order completion fails
   */
  @OnCompensation('order.process_payment', {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    historyService: 'OrderSagaHistoryService',
  })
  async compensateProcessPayment(
    @Entity() order: Order,
    @Payload() payload: { transactionId: string; amount: number },
  ): Promise<void> {
    this.logger.warn(`[SAGA COMPENSATION 2] Refunding payment for order ${order.id}`);

    // Call payment service to refund the transaction
    // await this.paymentService.refund({
    //   transactionId: payload.transactionId,
    //   amount: payload.amount,
    //   reason: 'Order processing failed',
    // });

    this.logger.log(`Payment refunded for transaction: ${payload.transactionId}`);
  }

  /**
   * Step 3: Complete the order
   * This is the final step - send confirmations, update analytics, etc.
   */
  @OnEvent('order.complete')
  async completeOrder(
    @Entity() order: Order,
    @Payload() payload: { transactionId: string; reservationId: string },
  ): Promise<void> {
    this.logger.log(`[SAGA STEP 3] Completing order ${order.id}`);

    // Send confirmation email
    // await this.notificationService.sendOrderConfirmation({
    //   orderId: order.id,
    //   customerId: order.customerId,
    //   transactionId: payload.transactionId,
    // });

    // Update analytics, inventory tracking, etc.
    // await this.analyticsService.trackOrderCompleted(order);

    this.logger.log(`Order ${order.id} completed successfully!`);
  }
}

// ==================== Supporting Services ====================

/**
 * Example implementation of Order Entity Service
 * This manages the order entity lifecycle
 */
@Injectable()
export class OrderEntityService {
  async load(urn: string): Promise<Order> {
    // Load order from database
    // return await this.orderRepository.findByUrn(urn);
    throw new Error('Not implemented');
  }

  async update(order: Order, status: OrderStatus): Promise<Order> {
    // Update order status in database
    // order.status = status;
    // return await this.orderRepository.save(order);
    throw new Error('Not implemented');
  }

  status(order: Order): OrderStatus {
    return order.status;
  }
}

/**
 * Example implementation of SAGA History Store
 * This persists SAGA context for replay and compensation
 */
@Injectable()
export class OrderSagaHistoryService {
  constructor() // Inject your storage mechanism
  // private readonly redis: Redis,
  // private readonly dynamodb: DynamoDB,
  {}

  async saveSagaContext(context: any): Promise<void> {
    // Save to Redis with TTL
    // await this.redis.set(
    //   `saga:${context.sagaId}`,
    //   JSON.stringify(context),
    //   'EX',
    //   3600 // 1 hour TTL
    // );
    // Or save to DynamoDB
    // await this.dynamodb.put({
    //   TableName: 'saga-history',
    //   Item: {
    //     sagaId: context.sagaId,
    //     context: context,
    //     ttl: Math.floor(Date.now() / 1000) + 3600,
    //   },
    // });
  }

  async getSagaContext(sagaId: string): Promise<any | null> {
    // Retrieve from Redis
    // const data = await this.redis.get(`saga:${sagaId}`);
    // return data ? JSON.parse(data) : null;

    // Or retrieve from DynamoDB
    // const result = await this.dynamodb.get({
    //   TableName: 'saga-history',
    //   Key: { sagaId },
    // });
    // return result.Item?.context || null;

    return null;
  }

  async deleteSagaContext(sagaId: string): Promise<void> {
    // Delete from Redis
    // await this.redis.del(`saga:${sagaId}`);
    // Or delete from DynamoDB
    // await this.dynamodb.delete({
    //   TableName: 'saga-history',
    //   Key: { sagaId },
    // });
  }
}

/**
 * Example Broker Publisher for checkpointing
 */
@Injectable()
export class OrderBrokerPublisher {
  async publish(event: any): Promise<void> {
    // Publish to SQS, SNS, EventBridge, etc.
    // await this.sqs.sendMessage({
    //   QueueUrl: process.env.QUEUE_URL,
    //   MessageBody: JSON.stringify(event),
    //   DelaySeconds: event.delay || 0,
    // });
  }
}
