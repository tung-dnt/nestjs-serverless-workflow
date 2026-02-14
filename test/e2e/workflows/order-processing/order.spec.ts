import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { WorkflowModule } from '@/core/workflow.module';
import { OrchestratorService } from '@/core/providers/ochestrator.service';
import { MockBrokerService } from '../../fixtures/mock-broker.service';
import { assertEntityState, assertBrokerEvent, createWorkflowEvent } from '../../fixtures/test-helpers';
import { OrderWorkflow, OrderEvent, ORDER_ENTITY_TOKEN, ORDER_BROKER_TOKEN } from './order.workflow';
import { OrderEntityService, OrderState } from './order.entity';

describe('Order Processing Workflow E2E', () => {
  let module: TestingModule;
  let orchestrator: OrchestratorService;
  let entityService: OrderEntityService;
  let broker: MockBrokerService;

  beforeEach(async () => {
    broker = new MockBrokerService();
    entityService = new OrderEntityService();

    module = await Test.createTestingModule({
      imports: [
        WorkflowModule.register({
          entities: [{ provide: ORDER_ENTITY_TOKEN, useValue: entityService }],
          workflows: [OrderWorkflow],
          brokers: [{ provide: ORDER_BROKER_TOKEN, useValue: broker }],
        }),
      ],
    }).compile();

    await module.init();
    orchestrator = module.get(OrchestratorService);
  });

  afterEach(async () => {
    entityService.clear();
    broker.clearEvents();
    await module.close();
  });

  describe('Happy Path', () => {
    test('should complete order workflow: PENDING → PROCESSING → SHIPPED', async () => {
      // Create order
      const order = await entityService.create();
      order.items = [{ name: 'Product 1', quantity: 2, price: 100 }];
      order.totalAmount = 200;
      await entityService.update(order, OrderState.PENDING);

      // Approve and process
      await orchestrator.transit(createWorkflowEvent(OrderEvent.CREATED, order.id, { approved: true }));
      let updatedOrder = await entityService.load(order.id);
      expect(updatedOrder).toBeDefined();
      assertEntityState(updatedOrder!, entityService, OrderState.PROCESSING);

      // Ship order
      await orchestrator.transit(createWorkflowEvent(OrderEvent.PROCESSING, order.id));
      updatedOrder = await entityService.load(order.id);
      expect(updatedOrder).toBeDefined();
      assertEntityState(updatedOrder!, entityService, OrderState.SHIPPED);

      // Verify broker event
      assertBrokerEvent(broker, 'order.shipment.notification', order.id);
    });
  });

  describe('Conditional Transitions', () => {
    test('should wait in PENDING when approval condition not met', async () => {
      const order = await entityService.create();
      order.items = [{ name: 'Product 1', quantity: 1, price: 50 }];
      await entityService.update(order, OrderState.PENDING);

      // Try to transition without approval
      await orchestrator.transit(createWorkflowEvent(OrderEvent.CREATED, order.id, { approved: false }));

      // Order should still be in PENDING (idle state, condition not met)
      const updatedOrder = await entityService.load(order.id);
      assertEntityState(updatedOrder!, entityService, OrderState.PENDING);
    });

    test('should transition when approval condition is met', async () => {
      const order = await entityService.create();
      order.items = [{ name: 'Product 1', quantity: 1, price: 50 }];
      await entityService.update(order, OrderState.PENDING);

      // Transition with approval
      await orchestrator.transit(createWorkflowEvent(OrderEvent.CREATED, order.id, { approved: true }));

      const updatedOrder = await entityService.load(order.id);
      assertEntityState(updatedOrder!, entityService, OrderState.PROCESSING);
    });

    test('should prevent cancellation of shipped order', async () => {
      const order = await entityService.create();
      order.items = [{ name: 'Product 1', quantity: 1, price: 50 }];
      await entityService.update(order, OrderState.SHIPPED);

      // Try to cancel shipped order (should fail due to condition)
      await expect(orchestrator.transit(createWorkflowEvent(OrderEvent.CANCELLED, order.id))).rejects.toThrow();

      const updatedOrder = await entityService.load(order.id);
      assertEntityState(updatedOrder!, entityService, OrderState.SHIPPED);
    });
  });

  describe('Cancellation Flow', () => {
    test('should cancel order from PENDING state', async () => {
      const order = await entityService.create();
      order.items = [{ name: 'Product 1', quantity: 1, price: 50 }];
      await entityService.update(order, OrderState.PENDING);

      await orchestrator.transit(createWorkflowEvent(OrderEvent.CANCELLED, order.id));

      const updatedOrder = await entityService.load(order.id);
      assertEntityState(updatedOrder!, entityService, OrderState.CANCELLED);
    });

    test('should cancel order from PROCESSING state', async () => {
      const order = await entityService.create();
      order.items = [{ name: 'Product 1', quantity: 1, price: 50 }];
      await entityService.update(order, OrderState.PROCESSING);

      await orchestrator.transit(createWorkflowEvent(OrderEvent.CANCELLED, order.id));

      const updatedOrder = await entityService.load(order.id);
      assertEntityState(updatedOrder!, entityService, OrderState.CANCELLED);
    });
  });

  describe('Error Handling', () => {
    test('should transition to FAILED when handler throws error', async () => {
      const order = await entityService.create();
      // Order with no items should fail validation
      order.items = [];
      await entityService.update(order, OrderState.PENDING);

      await orchestrator.transit(createWorkflowEvent(OrderEvent.CREATED, order.id, { approved: true }));

      const updatedOrder = await entityService.load(order.id);
      assertEntityState(updatedOrder!, entityService, OrderState.FAILED);
    });

    test('should throw error for invalid transition', async () => {
      const order = await entityService.create();
      await entityService.update(order, OrderState.SHIPPED);

      // Try to transition from final state
      await expect(
        orchestrator.transit(createWorkflowEvent(OrderEvent.CREATED, order.id, { approved: true })),
      ).rejects.toThrow();
    });

    test('should throw error when entity not found', async () => {
      await expect(
        orchestrator.transit(createWorkflowEvent(OrderEvent.CREATED, 'non-existent-order', { approved: true })),
      ).rejects.toThrow();
    });
  });

  describe('Broker Integration', () => {
    test('should emit broker event when order is shipped', async () => {
      const order = await entityService.create();
      order.items = [{ name: 'Product 1', quantity: 1, price: 50 }];
      await entityService.update(order, OrderState.PROCESSING);

      await orchestrator.transit(createWorkflowEvent(OrderEvent.PROCESSING, order.id));

      assertBrokerEvent(broker, 'order.shipment.notification', order.id);
      const events = broker.getEventsByTopic('order.shipment.notification');
      expect(events).toHaveLength(1);
      expect(events[0].payload).toHaveProperty('orderId', order.id);
      expect(events[0].payload).toHaveProperty('customerId', order.customerId);
    });
  });

  describe('Idle State Behavior', () => {
    test('should wait in idle state when condition not met', async () => {
      const order = await entityService.create();
      order.items = [{ name: 'Product 1', quantity: 1, price: 50 }];
      await entityService.update(order, OrderState.PENDING);

      // Event without approval
      await orchestrator.transit(createWorkflowEvent(OrderEvent.CREATED, order.id, { approved: false }));

      // Should still be in PENDING (idle)
      let updatedOrder = await entityService.load(order.id);
      assertEntityState(updatedOrder!, entityService, OrderState.PENDING);

      // Now with approval
      await orchestrator.transit(createWorkflowEvent(OrderEvent.CREATED, order.id, { approved: true }));

      // Should transition to PROCESSING
      updatedOrder = await entityService.load(order.id);
      assertEntityState(updatedOrder!, entityService, OrderState.PROCESSING);
    });
  });

  describe('Automatic Transitions', () => {
    test('should automatically transition from PROCESSING to SHIPPED', async () => {
      const order = await entityService.create();
      order.items = [{ name: 'Product 1', quantity: 1, price: 50 }];
      await entityService.update(order, OrderState.PROCESSING);

      // PROCESSING event should automatically transition to SHIPPED
      await orchestrator.transit(createWorkflowEvent(OrderEvent.PROCESSING, order.id));

      const updatedOrder = await entityService.load(order.id);
      assertEntityState(updatedOrder!, entityService, OrderState.SHIPPED);
    });
  });
});
