# SAGA Pattern Integration Guide

## Overview

This guide explains how to integrate the SAGA pattern into your NestJS serverless workflows to ensure data consistency across distributed transactions with automatic compensation on failure.

## Table of Contents

- [What is SAGA?](#what-is-saga)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Rollback Strategies](#rollback-strategies)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## What is SAGA?

The SAGA pattern is a design pattern for managing distributed transactions by breaking them into a series of local transactions, each with a corresponding compensation action that undoes its effects if a later step fails.

### Benefits

- ✅ **Data Consistency**: Maintain consistency across microservices without distributed locks
- ✅ **Fault Tolerance**: Automatic rollback on failures
- ✅ **Observability**: Complete history of all steps and compensations
- ✅ **Replay Support**: Resume workflows from checkpoints
- ✅ **Serverless-Friendly**: Works perfectly with AWS Lambda, Azure Functions, etc.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Workflow Orchestrator                         │
│                                                                  │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐           │
│  │   Step 1   │───▶│   Step 2   │───▶│   Step 3   │  SUCCESS  │
│  │  Reserve   │    │  Payment   │    │  Complete  │           │
│  └────────────┘    └────────────┘    └────────────┘           │
│       │                  │                  │                   │
│       │                  │                  ✗ FAILURE           │
│       │                  │                  │                   │
│       ▼                  ▼                  ▼                   │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐           │
│  │ Compensate │◀───│ Compensate │◀───│   Error    │  ROLLBACK │
│  │  Release   │    │   Refund   │    │  Handler   │           │
│  └────────────┘    └────────────┘    └────────────┘           │
│                                                                  │
│  ┌──────────────────────────────────────────────────┐          │
│  │           SAGA History Store (Redis/DynamoDB)     │          │
│  │  - Tracks all executed steps                      │          │
│  │  - Stores entity state before/after each step     │          │
│  │  - Enables replay and debugging                   │          │
│  └──────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
npm install @nestjs/common @nestjs/core reflect-metadata rxjs
# Choose your storage backend
npm install ioredis  # for Redis
# or
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb  # for DynamoDB
```

### 2. Define Your Workflow with SAGA

```typescript
import { Injectable } from '@nestjs/common';
import {
  Workflow,
  OnEvent,
  OnCompensation,
  Entity,
  Payload,
  RollbackStrategy,
} from '@/workflow';

@Injectable()
@Workflow({
  name: 'order-processing',
  entityService: 'OrderEntityService',
  brokerPublisher: 'OrderBrokerPublisher',
  states: {
    initial: 'pending',
    finals: ['completed', 'failed'],
    failed: 'failed',
    idles: [],
  },
  transitions: [
    { from: 'pending', to: 'reserved', event: 'reserve' },
    { from: 'reserved', to: 'paid', event: 'pay' },
    { from: 'paid', to: 'completed', event: 'complete' },
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
  // Forward handler
  @OnEvent('reserve')
  async reserveInventory(@Entity() order: Order): Promise<any> {
    // Your business logic
    return { reservationId: 'RES-123' };
  }

  // Compensation handler
  @OnCompensation('reserve', {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    historyService: 'OrderSagaHistoryService',
  })
  async compensateReserve(@Entity() order: Order, @Payload() payload: any): Promise<void> {
    // Undo the reservation
  }
}
```

### 3. Implement History Store

```typescript
import { Injectable } from '@nestjs/common';
import { ISagaHistoryStore, SagaContext } from '@/workflow';

@Injectable()
export class OrderSagaHistoryService implements ISagaHistoryStore<Order> {
  constructor(private readonly redis: Redis) {}

  async saveSagaContext(context: SagaContext<Order>): Promise<void> {
    await this.redis.set(
      `saga:${context.sagaId}`,
      JSON.stringify(context),
      'EX',
      3600
    );
  }

  async getSagaContext(sagaId: string): Promise<SagaContext<Order> | null> {
    const data = await this.redis.get(`saga:${sagaId}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteSagaContext(sagaId: string): Promise<void> {
    await this.redis.del(`saga:${sagaId}`);
  }
}
```

### 4. Register in Module

```typescript
@Module({
  providers: [
    OrderWorkflowService,
    {
      provide: 'OrderEntityService',
      useClass: OrderEntityService,
    },
    {
      provide: 'OrderBrokerPublisher',
      useClass: OrderBrokerPublisher,
    },
    {
      provide: 'OrderSagaHistoryService',
      useClass: OrderSagaHistoryService,
    },
  ],
})
export class OrderModule {}
```

## Configuration

### SAGA Configuration Options

```typescript
interface ISagaConfig {
  // Enable SAGA pattern
  enabled: boolean;

  // Mode selector (type-safe)
  mode: 'saga';

  // How compensations are executed
  rollbackStrategy: RollbackStrategy;

  // Maximum time for SAGA completion (ms)
  timeout?: number;

  // Stop on first compensation failure
  failFast?: boolean;

  // Injection token for history service
  historyService: string;

  // Custom SAGA ID generator
  sagaIdGenerator?: () => string;
}
```

### Rollback Strategies

#### REVERSE_ORDER (Recommended)
Executes compensations in reverse order of execution.

```
Execution:     Step1 → Step2 → Step3 ✗
Compensation:  Step3 ← Step2 ← Step1
```

**Use Case**: Most common pattern - undo operations in reverse order.

#### IN_ORDER
Executes compensations in the same order as execution.

```
Execution:     Step1 → Step2 → Step3 ✗
Compensation:  Step1 → Step2 → Step3
```

**Use Case**: When order matters (e.g., releasing resources before canceling reservations).

#### PARALLEL
Executes all compensations simultaneously.

```
Execution:     Step1 → Step2 → Step3 ✗
Compensation:  Step1 ∥ Step2 ∥ Step3
```

**Use Case**: Independent compensations that can run in parallel for faster rollback.

## Usage Examples

### Example 1: E-Commerce Order Processing

```typescript
@Workflow({
  name: 'ecommerce-order',
  saga: {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    historyService: 'OrderSagaHistoryService',
  },
  // ... other config
})
export class EcommerceOrderWorkflow {
  // Step 1: Reserve Inventory
  @OnEvent('order.reserve_inventory')
  @WithRetry({ maxAttempts: 3, delay: 1000, handler: 'RetryHandler' })
  async reserveInventory(@Entity() order: Order): Promise<ReservationResult> {
    const reservation = await this.inventoryService.reserve(order.items);
    return { reservationId: reservation.id };
  }

  @OnCompensation('order.reserve_inventory', { /* config */ })
  async releaseInventory(@Entity() order: Order, @Payload() payload: any): Promise<void> {
    await this.inventoryService.release(payload.reservationId);
  }

  // Step 2: Process Payment
  @OnEvent('order.process_payment')
  @WithRetry({ maxAttempts: 3, delay: 2000, handler: 'RetryHandler' })
  async processPayment(@Entity() order: Order): Promise<PaymentResult> {
    const payment = await this.paymentService.charge(order.total);
    return { transactionId: payment.id };
  }

  @OnCompensation('order.process_payment', { /* config */ })
  async refundPayment(@Entity() order: Order, @Payload() payload: any): Promise<void> {
    await this.paymentService.refund(payload.transactionId);
  }

  // Step 3: Send Confirmation
  @OnEvent('order.send_confirmation')
  async sendConfirmation(@Entity() order: Order): Promise<void> {
    await this.emailService.sendOrderConfirmation(order);
  }
}
```

### Example 2: Hotel Booking System

```typescript
@Workflow({
  name: 'hotel-booking',
  saga: {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.PARALLEL, // Fast rollback
    historyService: 'BookingSagaHistoryService',
  },
  // ... other config
})
export class HotelBookingWorkflow {
  // Forward: Reserve room, car, flight
  @OnEvent('booking.reserve_room')
  async reserveRoom(@Entity() booking: Booking): Promise<any> {
    return await this.hotelService.reserve(booking.roomId);
  }

  @OnCompensation('booking.reserve_room', { /* config */ })
  async cancelRoom(@Entity() booking: Booking, @Payload() payload: any): Promise<void> {
    await this.hotelService.cancel(payload.reservationId);
  }

  @OnEvent('booking.reserve_car')
  async reserveCar(@Entity() booking: Booking): Promise<any> {
    return await this.carService.reserve(booking.carId);
  }

  @OnCompensation('booking.reserve_car', { /* config */ })
  async cancelCar(@Entity() booking: Booking, @Payload() payload: any): Promise<void> {
    await this.carService.cancel(payload.reservationId);
  }
}
```

### Example 3: Bank Transfer (Financial Transaction)

```typescript
@Workflow({
  name: 'bank-transfer',
  saga: {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    failFast: true, // Critical: stop immediately on compensation failure
    timeout: 10000,
    historyService: 'TransferSagaHistoryService',
  },
  // ... other config
})
export class BankTransferWorkflow {
  @OnEvent('transfer.debit_source')
  async debitSource(@Entity() transfer: Transfer): Promise<any> {
    return await this.accountService.debit(transfer.fromAccount, transfer.amount);
  }

  @OnCompensation('transfer.debit_source', { /* config */ })
  async creditSource(@Entity() transfer: Transfer, @Payload() payload: any): Promise<void> {
    await this.accountService.credit(transfer.fromAccount, transfer.amount);
  }

  @OnEvent('transfer.credit_destination')
  async creditDestination(@Entity() transfer: Transfer): Promise<any> {
    return await this.accountService.credit(transfer.toAccount, transfer.amount);
  }

  @OnCompensation('transfer.credit_destination', { /* config */ })
  async debitDestination(@Entity() transfer: Transfer, @Payload() payload: any): Promise<void> {
    await this.accountService.debit(transfer.toAccount, transfer.amount);
  }
}
```

## Best Practices

### 1. Idempotency

Ensure all handlers and compensations are idempotent:

```typescript
@OnEvent('order.process_payment')
async processPayment(@Entity() order: Order): Promise<any> {
  // Check if already processed
  if (order.transactionId) {
    return { transactionId: order.transactionId, alreadyProcessed: true };
  }
  
  const result = await this.paymentService.charge(order.amount);
  return { transactionId: result.id };
}

@OnCompensation('order.process_payment', { /* config */ })
async refundPayment(@Entity() order: Order, @Payload() payload: any): Promise<void> {
  // Check if already refunded
  const status = await this.paymentService.getStatus(payload.transactionId);
  if (status === 'refunded') {
    return;
  }
  
  await this.paymentService.refund(payload.transactionId);
}
```

### 2. Error Handling

Use structured errors and retry strategies:

```typescript
@OnEvent('order.reserve_inventory')
@WithRetry({
  maxAttempts: 3,
  delay: 1000,
  handler: 'ExponentialBackoffRetryHandler',
})
async reserveInventory(@Entity() order: Order): Promise<any> {
  try {
    return await this.inventoryService.reserve(order.items);
  } catch (error) {
    if (error.code === 'OUT_OF_STOCK') {
      // Don't retry - mark as unretriable
      throw new UnretriableException('Inventory unavailable');
    }
    // Retry for transient errors
    throw error;
  }
}
```

### 3. Logging and Monitoring

Add comprehensive logging:

```typescript
@OnEvent('order.process_payment')
async processPayment(@Entity() order: Order): Promise<any> {
  this.logger.log(`Processing payment for order ${order.id}, amount: ${order.amount}`);
  
  const startTime = Date.now();
  try {
    const result = await this.paymentService.charge(order.amount);
    const duration = Date.now() - startTime;
    
    this.logger.log(`Payment processed successfully in ${duration}ms: ${result.transactionId}`);
    this.metricsService.recordSuccess('payment_processing', duration);
    
    return result;
  } catch (error) {
    this.logger.error(`Payment failed for order ${order.id}:`, error);
    this.metricsService.recordFailure('payment_processing');
    throw error;
  }
}
```

### 4. State Validation

Validate entity state before executing steps:

```typescript
@OnEvent('order.process_payment')
async processPayment(@Entity() order: Order): Promise<any> {
  // Validate preconditions
  if (!order.reservationId) {
    throw new BadRequestException('Cannot process payment: inventory not reserved');
  }
  
  if (order.amount <= 0) {
    throw new BadRequestException('Invalid order amount');
  }
  
  return await this.paymentService.charge(order.amount);
}
```

### 5. Use History Store Wisely

Choose the right storage backend:

| Backend | Best For | Pros | Cons |
|---------|----------|------|------|
| **Redis** | High-throughput, short-lived SAGAs | Fast, TTL support | Not durable |
| **DynamoDB** | Serverless, AWS Lambda | Scalable, serverless | Cost per request |
| **PostgreSQL** | Long-running, complex queries | ACID, queryable | Setup overhead |
| **MongoDB** | Document-heavy workflows | Flexible schema | Eventual consistency |

## Troubleshooting

### Common Issues

#### 1. Compensation Not Executing

**Problem**: Compensation handlers are not being called on failure.

**Solution**: Ensure `@OnCompensation` decorator uses the same event name as the forward handler:

```typescript
@OnEvent('order.reserve_inventory')  // ← Must match
async reserveInventory() { /* ... */ }

@OnCompensation('order.reserve_inventory', { /* config */ })  // ← Must match
async compensateReserve() { /* ... */ }
```

#### 2. SAGA Context Not Found

**Problem**: `getSagaContext` returns null.

**Solution**: Check history service configuration and ensure it's properly injected:

```typescript
saga: {
  historyService: 'OrderSagaHistoryService',  // ← Must match provider token
}

// In module
providers: [
  {
    provide: 'OrderSagaHistoryService',  // ← Must match
    useClass: OrderSagaHistoryService,
  },
]
```

#### 3. Timeout Issues

**Problem**: SAGA times out before completion.

**Solution**: Adjust timeout or optimize handlers:

```typescript
saga: {
  timeout: 60000,  // Increase timeout to 60 seconds
}
```

#### 4. Duplicate Executions

**Problem**: Steps execute multiple times.

**Solution**: Implement idempotency checks (see Best Practices #1).

### Debugging

Enable detailed logging:

```typescript
// In main.ts or app.module.ts
import { Logger } from '@nestjs/common';

const logger = new Logger('SagaDebug');
logger.log('SAGA debugging enabled');

// Set environment variable
process.env.LOG_LEVEL = 'debug';
```

View SAGA history:

```typescript
// Add a debug endpoint
@Get('saga/:sagaId')
async getSagaHistory(@Param('sagaId') sagaId: string) {
  const context = await this.historyService.getSagaContext(sagaId);
  return {
    sagaId: context.sagaId,
    status: context.status,
    steps: context.executedSteps,
    error: context.error,
  };
}
```

## Advanced Topics

### Custom SAGA ID Generator

```typescript
saga: {
  sagaIdGenerator: () => {
    return `saga-${process.env.SERVICE_NAME}-${Date.now()}-${uuidv4()}`;
  },
}
```

### Conditional Compensations

```typescript
@OnCompensation('order.process_payment', {
  enabled: true,
  mode: 'saga',
  rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
  historyService: 'OrderSagaHistoryService',
})
async compensatePayment(@Entity() order: Order, @Payload() payload: any): Promise<void> {
  // Only refund if payment was actually processed
  if (payload.transactionId && payload.charged) {
    await this.paymentService.refund(payload.transactionId);
  }
}
```

### Resuming Failed SAGAs

```typescript
async resumeFailedSaga(sagaId: string) {
  const context = await this.sagaService.resumeSaga(
    sagaId,
    this.historyService
  );
  
  if (context.status === SagaStatus.COMPENSATING) {
    // Continue compensation
    await this.sagaService.executeCompensations(/* ... */);
  }
}
```

## References

- [SAGA Pattern (Original Paper)](https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf)
- [Microservices Patterns: SAGA](https://microservices.io/patterns/data/saga.html)
- [AWS Step Functions for SAGA](https://aws.amazon.com/step-functions/)

## Support

For issues or questions, please refer to the main repository documentation or open an issue on GitHub.