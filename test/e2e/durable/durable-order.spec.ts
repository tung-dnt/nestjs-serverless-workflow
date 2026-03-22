import { describe, test, expect, beforeAll, beforeEach } from 'bun:test';
import { Test } from '@nestjs/testing';
import { WorkflowModule } from '@/core';
import { DurableLambdaEventHandler } from '@/adapter';
import type { DurableWorkflowEvent, DurableWorkflowResult } from '@/adapter';
import { MockDurableContext, mockWithDurableExecution } from '../fixtures/mock-durable-context';
import { OrderWorkflow, OrderEvent, ORDER_ENTITY_TOKEN } from '../workflows/order-processing/order.workflow';
import { OrderEntityService, OrderState } from '../workflows/order-processing/order.entity';

describe('Durable Lambda Adapter — Order Workflow E2E', () => {
  let handler: (event: DurableWorkflowEvent, ctx: MockDurableContext) => Promise<DurableWorkflowResult>;
  let entityService: OrderEntityService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        WorkflowModule.register({
          entities: [{ provide: ORDER_ENTITY_TOKEN, useValue: new OrderEntityService() }],
          workflows: [OrderWorkflow],
        }),
      ],
    }).compile();

    const app = module.createNestApplication();
    await app.init();

    entityService = module.get<OrderEntityService>(ORDER_ENTITY_TOKEN);
    handler = DurableLambdaEventHandler(app, mockWithDurableExecution) as any;
  });

  beforeEach(() => {
    entityService.clear();
  });

  describe('Happy Path', () => {
    test('should process order PENDING → PROCESSING → SHIPPED with callback between steps', async () => {
      const order = await entityService.create();
      order.items = [{ name: 'Widget', quantity: 1, price: 10 }];
      order.totalAmount = 10;
      await entityService.update(order, OrderState.PENDING);

      const ctx = new MockDurableContext();

      const resultPromise = handler(
        { urn: order.id, initialEvent: OrderEvent.CREATED, payload: { approved: true } },
        ctx,
      );

      // First transit: PENDING → PROCESSING (handler runs).
      // From PROCESSING, auto-transition is ambiguous (SHIPPED vs CANCELLED both match).
      // Adapter calls waitForCallback for `awaiting:PROCESSING:0`.
      await ctx.waitUntilCallbackRegistered(`awaiting:${OrderState.PROCESSING}:0`);

      ctx.submitCallback(`awaiting:${OrderState.PROCESSING}:0`, {
        event: OrderEvent.PROCESSING,
        payload: {},
      });

      // Second transit: PROCESSING → SHIPPED (final).
      const result = await resultPromise;

      expect(result.status).toBe('completed');
      expect(result.state).toBe(OrderState.SHIPPED);

      const updatedOrder = await entityService.load(order.id);
      expect(entityService.status(updatedOrder!)).toBe(OrderState.SHIPPED);
    });
  });

  describe('Idle State — Callback Wait', () => {
    test('should wait at idle state and resume on callback', async () => {
      const order = await entityService.create();
      order.items = [{ name: 'Widget', quantity: 1, price: 10 }];
      order.totalAmount = 10;
      await entityService.update(order, OrderState.PENDING);

      const ctx = new MockDurableContext();

      // Send event that doesn't meet conditions (not approved) — entity stays in idle
      const resultPromise = handler(
        { urn: order.id, initialEvent: OrderEvent.CREATED, payload: { approved: false } },
        ctx,
      );

      // Transit returns 'idle' (PENDING is idle, conditions not met).
      const idleKey = `idle:${OrderState.PENDING}:0`;
      await ctx.waitUntilCallbackRegistered(idleKey);
      ctx.submitCallback(idleKey, {
        event: OrderEvent.CREATED,
        payload: { approved: true },
      });

      // Now PENDING → PROCESSING → awaiting callback (ambiguous auto-transition)
      const awaitKey = `awaiting:${OrderState.PROCESSING}:1`;
      await ctx.waitUntilCallbackRegistered(awaitKey);
      ctx.submitCallback(awaitKey, {
        event: OrderEvent.PROCESSING,
        payload: {},
      });

      const result = await resultPromise;

      expect(result.status).toBe('completed');
      expect(result.state).toBe(OrderState.SHIPPED);
    });
  });

  describe('Error Handling', () => {
    test('should return completed with FAILED state on unretriable error', async () => {
      const order = await entityService.create();
      order.items = [];
      order.totalAmount = 0;
      await entityService.update(order, OrderState.PENDING);

      const ctx = new MockDurableContext();

      const result = await handler(
        { urn: order.id, initialEvent: OrderEvent.CREATED, payload: { approved: true } },
        ctx,
      );

      expect(result.status).toBe('completed');
      expect(result.state).toBe(OrderState.FAILED);

      const updatedOrder = await entityService.load(order.id);
      expect(entityService.status(updatedOrder!)).toBe(OrderState.FAILED);
    });

    test('should throw for event with no route', async () => {
      const order = await entityService.create();
      await entityService.update(order, OrderState.PROCESSING);

      const ctx = new MockDurableContext();

      await expect(handler({ urn: order.id, initialEvent: 'nonexistent.event', payload: {} }, ctx)).rejects.toThrow();
    });
  });

  describe('Cancellation', () => {
    test('should cancel order from PENDING state', async () => {
      const order = await entityService.create();
      order.items = [{ name: 'Widget', quantity: 1, price: 10 }];
      await entityService.update(order, OrderState.PENDING);

      const ctx = new MockDurableContext();

      const result = await handler({ urn: order.id, initialEvent: OrderEvent.CANCELLED, payload: {} }, ctx);

      expect(result.status).toBe('completed');
      expect(result.state).toBe(OrderState.CANCELLED);
    });
  });
});
