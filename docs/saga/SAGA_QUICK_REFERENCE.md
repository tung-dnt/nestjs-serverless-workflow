# SAGA Pattern Quick Reference

A quick cheat sheet for implementing SAGA pattern in your workflows.

## 📋 Basic Setup

### 1. Enable SAGA in Workflow

```typescript
@Workflow({
  name: 'my-workflow',
  saga: {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    historyService: 'MySagaHistoryService',
  },
  // ... other config
})
export class MyWorkflow {}
```

### 2. Define Forward Handler

```typescript
@OnEvent('my.event')
async doSomething(@Entity() entity: MyEntity): Promise<any> {
  // Your business logic
  return { result: 'data' };
}
```

### 3. Define Compensation Handler

```typescript
@OnCompensation('my.event', {
  enabled: true,
  mode: 'saga',
  rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
  historyService: 'MySagaHistoryService',
})
async undoSomething(@Entity() entity: MyEntity, @Payload() payload: any): Promise<void> {
  // Undo logic
}
```

### 4. Implement History Store

```typescript
@Injectable()
export class MySagaHistoryService implements ISagaHistoryStore<MyEntity> {
  async saveSagaContext(context: SagaContext<MyEntity>): Promise<void> { }
  async getSagaContext(sagaId: string): Promise<SagaContext<MyEntity> | null> { }
  async deleteSagaContext(sagaId: string): Promise<void> { }
}
```

### 5. Register in Module

```typescript
@Module({
  providers: [
    MyWorkflow,
    { provide: 'MySagaHistoryService', useClass: MySagaHistoryService },
  ],
})
export class MyModule {}
```

---

## 🎯 Rollback Strategies

| Strategy | Execution | Use Case |
|----------|-----------|----------|
| `REVERSE_ORDER` | Step3 ← Step2 ← Step1 | Default - most common |
| `IN_ORDER` | Step1 → Step2 → Step3 | Order matters |
| `PARALLEL` | Step1 ∥ Step2 ∥ Step3 | Independent steps |

---

## 🔧 Configuration Options

```typescript
interface ISagaConfig {
  enabled: boolean;              // Enable SAGA
  mode: 'saga';                  // Type-safe mode
  rollbackStrategy: RollbackStrategy;
  timeout?: number;              // Max SAGA duration (ms)
  failFast?: boolean;            // Stop on first compensation failure
  historyService: string;        // Injection token
  sagaIdGenerator?: () => string; // Custom ID generator
}
```

---

## 📝 Decorators

### @OnEvent
```typescript
@OnEvent('event.name')
async handler(@Entity() entity, @Payload() payload): Promise<any> {
  return { data };
}
```

### @OnCompensation
```typescript
@OnCompensation('event.name', { /* ISagaConfig */ })
async compensate(@Entity() entity, @Payload() payload): Promise<void> {
  // Undo
}
```

### @WithRetry
```typescript
@WithRetry({
  maxAttempts: 3,
  initialDelay: 1000,
  handler: 'ExponentialBackoffRetryHandler',
})
```

### @Entity & @Payload
```typescript
async handler(@Entity() entity: MyEntity, @Payload() payload: MyPayload) {
  // entity = current workflow entity
  // payload = data from previous step or trigger
}
```

---

## 🔄 SAGA Context Structure

```typescript
interface SagaContext<T> {
  sagaId: string;                 // Unique ID
  entity: T;                      // Workflow entity
  executedSteps: SagaStep<T>[];   // Step history
  status: SagaStatus;             // Current status
  startedAt: Date;
  completedAt?: Date;
  error?: Error;
  metadata?: Record<string, any>;
}
```

### SagaStatus Values
- `RUNNING` - In progress
- `COMPLETED` - Success
- `COMPENSATING` - Rolling back
- `COMPENSATED` - Rollback complete
- `FAILED` - Error in compensation

---

## 📊 Step Recording

```typescript
interface SagaStep<T, P> {
  event: string;           // Event that triggered step
  executedAt: Date;        // Timestamp
  beforeState: T;          // Entity before step
  afterState: T;           // Entity after step
  payload?: P;             // Step payload
  compensated: boolean;    // Compensation status
}
```

---

## 🗄️ History Store Implementations

### In-Memory (Development)
```typescript
@Injectable()
export class InMemorySagaHistoryService implements ISagaHistoryStore<T> {
  private storage = new Map<string, SagaContext<T>>();
  
  async saveSagaContext(context: SagaContext<T>): Promise<void> {
    this.storage.set(context.sagaId, JSON.parse(JSON.stringify(context)));
  }
  
  async getSagaContext(sagaId: string): Promise<SagaContext<T> | null> {
    return this.storage.get(sagaId) || null;
  }
  
  async deleteSagaContext(sagaId: string): Promise<void> {
    this.storage.delete(sagaId);
  }
}
```

### Redis (Production)
```typescript
async saveSagaContext(context: SagaContext<T>): Promise<void> {
  await this.redis.set(
    `saga:${context.sagaId}`,
    JSON.stringify(context),
    'EX',
    3600 // 1 hour TTL
  );
}

async getSagaContext(sagaId: string): Promise<SagaContext<T> | null> {
  const data = await this.redis.get(`saga:${sagaId}`);
  return data ? JSON.parse(data) : null;
}
```

### DynamoDB (Serverless)
```typescript
async saveSagaContext(context: SagaContext<T>): Promise<void> {
  await this.dynamodb.put({
    TableName: 'saga-history',
    Item: {
      sagaId: context.sagaId,
      context: context,
      ttl: Math.floor(Date.now() / 1000) + 3600,
    },
  });
}
```

---

## ✅ Best Practices Checklist

- [ ] **Idempotency**: Check if operation already done
- [ ] **Retry Logic**: Use `@WithRetry` for transient errors
- [ ] **Logging**: Log all steps and compensations
- [ ] **Validation**: Validate entity state before operations
- [ ] **Error Types**: Use `UnretriableException` for business errors
- [ ] **Event Names**: Match exactly between `@OnEvent` and `@OnCompensation`
- [ ] **Timeout**: Set appropriate `timeout` value
- [ ] **Storage**: Choose right history store for your use case

---

## 🎯 Complete Example

```typescript
enum OrderStatus {
  PENDING = 'pending',
  RESERVED = 'reserved',
  PAID = 'paid',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

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
    { from: [OrderStatus.PENDING], to: OrderStatus.RESERVED, event: 'reserve' },
    { from: [OrderStatus.RESERVED], to: OrderStatus.PAID, event: 'pay' },
    { from: [OrderStatus.PAID], to: OrderStatus.COMPLETED, event: 'complete' },
  ],
  saga: {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    historyService: 'OrderSagaHistoryService',
  },
})
export class OrderWorkflow {
  // Step 1: Reserve
  @OnEvent('reserve')
  @WithRetry({ maxAttempts: 3, initialDelay: 1000, handler: 'RetryHandler' })
  async reserve(@Entity() order: Order): Promise<any> {
    return { reservationId: 'RES-123' };
  }

  @OnCompensation('reserve', {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    historyService: 'OrderSagaHistoryService',
  })
  async releaseReservation(@Entity() order: Order, @Payload() payload: any): Promise<void> {
    // Release reservation
  }

  // Step 2: Pay
  @OnEvent('pay')
  @WithRetry({ maxAttempts: 3, initialDelay: 2000, handler: 'RetryHandler' })
  async pay(@Entity() order: Order): Promise<any> {
    return { transactionId: 'TXN-456' };
  }

  @OnCompensation('pay', {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    historyService: 'OrderSagaHistoryService',
  })
  async refund(@Entity() order: Order, @Payload() payload: any): Promise<void> {
    // Refund payment
  }

  // Step 3: Complete
  @OnEvent('complete')
  async complete(@Entity() order: Order): Promise<void> {
    // Send confirmation
  }
}
```

---

## 🐛 Common Issues & Fixes

### Issue: Compensation not executing
```typescript
// ❌ Wrong - event names don't match
@OnEvent('order.reserve')
@OnCompensation('order.release', { /* config */ })

// ✅ Correct - event names match
@OnEvent('order.reserve')
@OnCompensation('order.reserve', { /* config */ })
```

### Issue: History service not found
```typescript
// ❌ Wrong - token mismatch
saga: { historyService: 'MySagaHistory' }
providers: [{ provide: 'SagaHistory', useClass: ... }]

// ✅ Correct - tokens match
saga: { historyService: 'MySagaHistoryService' }
providers: [{ provide: 'MySagaHistoryService', useClass: ... }]
```

### Issue: Duplicate executions
```typescript
// ✅ Add idempotency check
@OnEvent('charge')
async charge(@Entity() order: Order): Promise<any> {
  if (order.transactionId) {
    return { transactionId: order.transactionId, alreadyCharged: true };
  }
  // Proceed with charge
}
```

---

## 📖 Files Reference

- **[SAGA_INTEGRATION_GUIDE.md](./SAGA_INTEGRATION_GUIDE.md)** - Full documentation
- **[simple-saga.example.ts](./simple-saga.example.ts)** - Minimal example (start here)
- **[order-workflow.service.example.ts](./order-workflow.service.example.ts)** - Production example
- **[saga-history.service.example.ts](./saga-history.service.example.ts)** - Storage implementations
- **[SAGA_FLOW_DIAGRAMS.md](./SAGA_FLOW_DIAGRAMS.md)** - Visual diagrams

---

## 🚀 Quick Test

```typescript
// 1. Create workflow with SAGA
// 2. Trigger workflow
const result = await orchestrator.transit({
  urn: 'order:123',
  topic: 'reserve',
  payload: { items: [...] },
  attempt: 0,
});

// 3. Check SAGA history
const context = await historyService.getSagaContext('saga-id');
console.log(context.status); // COMPLETED or COMPENSATED
console.log(context.executedSteps); // All steps
```

---

## 💡 Pro Tips

1. **Start Simple**: Use `simple-saga.example.ts` as template
2. **Test Compensations**: Manually trigger failures to verify rollback
3. **Monitor History**: Add debugging endpoint to view SAGA state
4. **Use Redis in Prod**: Fast and supports TTL
5. **Set Timeouts**: Prevent infinite SAGA execution
6. **Log Everything**: Makes debugging much easier
7. **Validate Early**: Check preconditions before executing steps

---

**Need Help?** Check [SAGA_INTEGRATION_GUIDE.md](./SAGA_INTEGRATION_GUIDE.md) for detailed explanations.