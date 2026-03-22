import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { Test } from '@nestjs/testing';
import { withDurableExecution } from '@aws/durable-execution-sdk-js';
import { LocalDurableTestRunner, WaitingOperationStatus } from '@aws/durable-execution-sdk-js-testing';
import { WorkflowModule } from '@/core';
import { DurableLambdaEventHandler } from '@/adapter';
import type { DurableWorkflowResult } from '@/adapter';
import { OrderWorkflow, OrderEvent, ORDER_ENTITY_TOKEN } from '../workflows/order-processing/order.workflow';
import { OrderEntityService, OrderState } from '../workflows/order-processing/order.entity';

describe('Durable Lambda Adapter — Order Workflow E2E', () => {
  let handler: ReturnType<typeof DurableLambdaEventHandler>;
  let entityService: OrderEntityService;

  beforeAll(async () => {
    await LocalDurableTestRunner.setupTestEnvironment({ skipTime: true });

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
    handler = DurableLambdaEventHandler(app, withDurableExecution as any);
  });

  afterAll(async () => {
    await LocalDurableTestRunner.teardownTestEnvironment();
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

      const runner = new LocalDurableTestRunner<DurableWorkflowResult>({ handlerFunction: handler as any });

      // Get the callback operation reference before running
      const awaitingCallback = runner.getOperation(`awaiting:${OrderState.PROCESSING}:0`);

      const executionPromise = runner.run({
        payload: { urn: order.id, initialEvent: OrderEvent.CREATED, payload: { approved: true } },
      });

      // Wait for the callback submitter to complete, then send the event
      await awaitingCallback.waitForData(WaitingOperationStatus.SUBMITTED);
      await awaitingCallback.sendCallbackSuccess(
        JSON.stringify({ event: OrderEvent.PROCESSING, payload: {} }),
      );

      const execution = await executionPromise;

      expect(execution.getStatus()).toBe('SUCCEEDED');
      expect(execution.getResult()).toEqual({
        urn: order.id,
        status: 'completed',
        state: OrderState.SHIPPED,
      });

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

      const runner = new LocalDurableTestRunner<DurableWorkflowResult>({ handlerFunction: handler as any });

      // First callback: idle at PENDING (conditions not met)
      const idleCallback = runner.getOperation(`idle:${OrderState.PENDING}:0`);
      // Second callback: awaiting at PROCESSING (ambiguous auto-transition)
      const awaitingCallback = runner.getOperation(`awaiting:${OrderState.PROCESSING}:1`);

      const executionPromise = runner.run({
        payload: { urn: order.id, initialEvent: OrderEvent.CREATED, payload: { approved: false } },
      });

      // Idle state: conditions not met, submit with approved: true
      await idleCallback.waitForData(WaitingOperationStatus.SUBMITTED);
      await idleCallback.sendCallbackSuccess(
        JSON.stringify({ event: OrderEvent.CREATED, payload: { approved: true } }),
      );

      // Now PENDING → PROCESSING → awaiting callback (ambiguous auto-transition)
      await awaitingCallback.waitForData(WaitingOperationStatus.SUBMITTED);
      await awaitingCallback.sendCallbackSuccess(
        JSON.stringify({ event: OrderEvent.PROCESSING, payload: {} }),
      );

      const execution = await executionPromise;

      expect(execution.getStatus()).toBe('SUCCEEDED');
      expect(execution.getResult()).toEqual({
        urn: order.id,
        status: 'completed',
        state: OrderState.SHIPPED,
      });
    });
  });

  describe('Error Handling', () => {
    test('should return completed with FAILED state on unretriable error', async () => {
      const order = await entityService.create();
      order.items = [];
      order.totalAmount = 0;
      await entityService.update(order, OrderState.PENDING);

      const runner = new LocalDurableTestRunner<DurableWorkflowResult>({ handlerFunction: handler as any });

      const execution = await runner.run({
        payload: { urn: order.id, initialEvent: OrderEvent.CREATED, payload: { approved: true } },
      });

      expect(execution.getStatus()).toBe('SUCCEEDED');
      expect(execution.getResult()).toEqual({
        urn: order.id,
        status: 'completed',
        state: OrderState.FAILED,
      });

      const updatedOrder = await entityService.load(order.id);
      expect(entityService.status(updatedOrder!)).toBe(OrderState.FAILED);
    });

    test('should fail for event with no route', async () => {
      const order = await entityService.create();
      await entityService.update(order, OrderState.PROCESSING);

      const runner = new LocalDurableTestRunner<DurableWorkflowResult>({ handlerFunction: handler as any });

      const execution = await runner.run({
        payload: { urn: order.id, initialEvent: 'nonexistent.event', payload: {} },
      });

      expect(execution.getStatus()).toBe('FAILED');
    });
  });

  describe('Cancellation', () => {
    test('should cancel order from PENDING state', async () => {
      const order = await entityService.create();
      order.items = [{ name: 'Widget', quantity: 1, price: 10 }];
      await entityService.update(order, OrderState.PENDING);

      const runner = new LocalDurableTestRunner<DurableWorkflowResult>({ handlerFunction: handler as any });

      const execution = await runner.run({
        payload: { urn: order.id, initialEvent: OrderEvent.CANCELLED, payload: {} },
      });

      expect(execution.getStatus()).toBe('SUCCEEDED');
      expect(execution.getResult()).toEqual({
        urn: order.id,
        status: 'completed',
        state: OrderState.CANCELLED,
      });
    });
  });

  describe('Operation Inspection', () => {
    test('should checkpoint each transit step', async () => {
      const order = await entityService.create();
      order.items = [{ name: 'Widget', quantity: 1, price: 10 }];
      await entityService.update(order, OrderState.PENDING);

      const runner = new LocalDurableTestRunner<DurableWorkflowResult>({ handlerFunction: handler as any });

      const awaitingCallback = runner.getOperation(`awaiting:${OrderState.PROCESSING}:0`);

      const executionPromise = runner.run({
        payload: { urn: order.id, initialEvent: OrderEvent.CREATED, payload: { approved: true } },
      });

      await awaitingCallback.waitForData(WaitingOperationStatus.SUBMITTED);
      await awaitingCallback.sendCallbackSuccess(
        JSON.stringify({ event: OrderEvent.PROCESSING, payload: {} }),
      );

      const execution = await executionPromise;

      // Verify step operations were checkpointed
      const transitStep = runner.getOperation(`transit:${OrderEvent.CREATED}:0:0`);
      const stepDetails = await transitStep.waitForData(WaitingOperationStatus.COMPLETED);
      expect(stepDetails.getStepDetails()?.result).toBeDefined();

      expect(execution.getOperations().length).toBeGreaterThanOrEqual(3);
    });
  });
});
