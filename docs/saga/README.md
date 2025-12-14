# SAGA Pattern Integration Examples

This directory contains comprehensive examples demonstrating how to integrate the SAGA pattern into your NestJS serverless workflows.

## 📁 Files Overview

### Core Implementation
- **[SAGA_INTEGRATION_GUIDE.md](./SAGA_INTEGRATION_GUIDE.md)** - Complete guide with architecture, best practices, and troubleshooting
- **[saga-history.service.example.ts](./saga-history.service.example.ts)** - Multiple implementations of ISagaHistoryStore (Redis, DynamoDB, PostgreSQL, MongoDB, In-Memory)

### Example Workflows
- **[simple-saga.example.ts](./simple-saga.example.ts)** - Minimal 2-step workflow (best starting point)
- **[order-workflow.service.example.ts](./order-workflow.service.example.ts)** - Complete e-commerce order processing with 3 steps

## 🚀 Quick Start

### 1. Start with the Simple Example

The [simple-saga.example.ts](./simple-saga.example.ts) demonstrates the basics:
- ✅ 2-step workflow (subscribe → activate)
- ✅ Automatic compensation on failure
- ✅ In-memory history store
- ✅ Minimal dependencies

```typescript
@Workflow({
  saga: {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    historyService: 'AccountSagaHistoryService',
  },
})
export class UserOnboardingWorkflow {
  @OnEvent('account.subscribe')
  async createSubscription(@Entity() account: UserAccount): Promise<any> {
    // Forward logic
  }

  @OnCompensation('account.subscribe', { /* config */ })
  async cancelSubscription(@Entity() account: UserAccount): Promise<void> {
    // Compensation logic
  }
}
```

### 2. Explore the Order Workflow

The [order-workflow.service.example.ts](./order-workflow.service.example.ts) shows a production-ready example:
- ✅ 3-step workflow (reserve inventory → process payment → complete order)
- ✅ Retry strategies with exponential backoff
- ✅ Production-ready services (entity, broker, history)
- ✅ Comprehensive error handling

### 3. Choose Your History Store

The [saga-history.service.example.ts](./saga-history.service.example.ts) provides implementations for:

| Storage | Use Case | Code Status |
|---------|----------|-------------|
| **In-Memory** | Development/Testing | ✅ Ready to use |
| **Redis** | Production (High throughput) | 📝 Template with comments |
| **DynamoDB** | AWS Lambda/Serverless | 📝 Template with comments |
| **PostgreSQL** | Traditional servers | 📝 Template with comments |
| **MongoDB** | Document-heavy workflows | 📝 Template with comments |

## 📖 Implementation Steps

### Step 1: Enable SAGA in Your Workflow

```typescript
@Workflow({
  name: 'my-workflow',
  // ... other config
  saga: {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    historyService: 'MySagaHistoryService',
  },
})
export class MyWorkflow { }
```

### Step 2: Add Forward Handlers

```typescript
@OnEvent('my.event')
async doSomething(@Entity() entity: MyEntity): Promise<any> {
  // Your business logic
  return { result: 'data' };
}
```

### Step 3: Add Compensation Handlers

```typescript
@OnCompensation('my.event', {
  enabled: true,
  mode: 'saga',
  rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
  historyService: 'MySagaHistoryService',
})
async undoSomething(@Entity() entity: MyEntity, @Payload() payload: any): Promise<void> {
  // Undo the action
}
```

### Step 4: Implement History Store

```typescript
@Injectable()
export class MySagaHistoryService implements ISagaHistoryStore<MyEntity> {
  async saveSagaContext(context: SagaContext<MyEntity>): Promise<void> {
    // Save to your storage
  }

  async getSagaContext(sagaId: string): Promise<SagaContext<MyEntity> | null> {
    // Retrieve from storage
  }

  async deleteSagaContext(sagaId: string): Promise<void> {
    // Delete from storage
  }
}
```

### Step 5: Register in Module

```typescript
@Module({
  providers: [
    MyWorkflow,
    { provide: 'MySagaHistoryService', useClass: MySagaHistoryService },
  ],
})
export class MyModule { }
```

## 🎯 Rollback Strategies

### REVERSE_ORDER (Most Common)
Compensations execute in reverse order:
```
Execute: Step1 → Step2 → Step3 ✗
Rollback: Step3 → Step2 → Step1
```

### IN_ORDER
Compensations execute in same order:
```
Execute: Step1 → Step2 → Step3 ✗
Rollback: Step1 → Step2 → Step3
```

### PARALLEL
All compensations execute simultaneously:
```
Execute: Step1 → Step2 → Step3 ✗
Rollback: Step1 ∥ Step2 ∥ Step3
```

## 🔍 How It Works

### Normal Flow (Success)
```
1. Workflow starts
2. SAGA context initialized
3. Step 1 executes → SAGA records step
4. Step 2 executes → SAGA records step
5. Step 3 executes → SAGA records step
6. Workflow completes → SAGA marked as COMPLETED
```

### Error Flow (Failure)
```
1. Workflow starts
2. SAGA context initialized
3. Step 1 executes → SAGA records step
4. Step 2 executes → SAGA records step
5. Step 3 FAILS ✗
6. SAGA marks as COMPENSATING
7. Compensation for Step 2 executes
8. Compensation for Step 1 executes
9. SAGA marked as COMPENSATED
10. Workflow marked as FAILED
```

## 💡 Best Practices

### 1. Make Handlers Idempotent

```typescript
@OnEvent('order.charge')
async chargePayment(@Entity() order: Order): Promise<any> {
  // Check if already charged
  if (order.transactionId) {
    return { transactionId: order.transactionId, alreadyCharged: true };
  }

  const result = await this.paymentService.charge(order.amount);
  return { transactionId: result.id };
}
```

### 2. Use Retry with Exponential Backoff

```typescript
@OnEvent('order.reserve')
@WithRetry({
  maxAttempts: 3,
  initialDelay: 1000,
  handler: 'ExponentialBackoffRetryHandler',
})
async reserveInventory(@Entity() order: Order): Promise<any> {
  return await this.inventoryService.reserve(order.items);
}
```

### 3. Log Everything

```typescript
@OnEvent('order.process')
async processOrder(@Entity() order: Order): Promise<any> {
  this.logger.log(`Processing order ${order.id}`);
  const result = await this.service.process(order);
  this.logger.log(`Order processed: ${result.id}`);
  return result;
}
```

### 4. Validate Before Executing

```typescript
@OnEvent('order.complete')
async completeOrder(@Entity() order: Order): Promise<void> {
  if (!order.paymentId) {
    throw new BadRequestException('Payment not processed');
  }
  // Continue with completion
}
```

## 🐛 Troubleshooting

### Compensations Not Running?

**Check**: Event names must match exactly
```typescript
@OnEvent('my.event')           // ← Must match
async forward() { }

@OnCompensation('my.event', {  // ← Must match
  /* config */
})
async compensate() { }
```

### SAGA Context Not Found?

**Check**: Provider token must match
```typescript
saga: {
  historyService: 'MySagaHistoryService',  // ← Must match
}

providers: [
  { provide: 'MySagaHistoryService', useClass: ... },  // ← Must match
]
```

### Timeout Issues?

**Solution**: Increase timeout
```typescript
saga: {
  timeout: 60000,  // 60 seconds
}
```

## 📚 Additional Resources

- **[SAGA_INTEGRATION_GUIDE.md](./SAGA_INTEGRATION_GUIDE.md)** - Comprehensive documentation
- [SAGA Pattern Paper](https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf) - Original research
- [Microservices Patterns](https://microservices.io/patterns/data/saga.html) - Pattern overview

## 🎓 Learning Path

1. **Beginner**: Start with [simple-saga.example.ts](./simple-saga.example.ts)
2. **Intermediate**: Study [order-workflow.service.example.ts](./order-workflow.service.example.ts)
3. **Advanced**: Read [SAGA_INTEGRATION_GUIDE.md](./SAGA_INTEGRATION_GUIDE.md)
4. **Production**: Choose storage from [saga-history.service.example.ts](./saga-history.service.example.ts)

## 🤝 Contributing

Found an issue or have an improvement? Please open an issue or submit a PR!

## 📝 License

Same as parent project.
