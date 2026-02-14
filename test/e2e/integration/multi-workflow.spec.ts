import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { WorkflowModule } from '@/core/workflow.module';
import { OrchestratorService } from '@/core/providers/ochestrator.service';
import { MockBrokerService } from '../fixtures/mock-broker.service';
import { MockRetryHandler } from '../fixtures/mock-retry-handler.service';
import { assertEntityState, createWorkflowEvent } from '../fixtures/test-helpers';

// Import all workflows
import {
  OrderWorkflow,
  OrderEvent,
  ORDER_ENTITY_TOKEN,
  ORDER_BROKER_TOKEN,
} from '../workflows/order-processing/order.workflow';
import { OrderEntityService, OrderState } from '../workflows/order-processing/order.entity';
import {
  UserOnboardingWorkflow,
  OnboardingEvent,
  ONBOARDING_ENTITY_TOKEN,
  ONBOARDING_BROKER_TOKEN,
} from '../workflows/user-onboarding/onboarding.workflow';
import { UserEntityService, OnboardingState } from '../workflows/user-onboarding/user.entity';
import {
  PaymentWorkflow,
  PaymentEvent,
  PAYMENT_ENTITY_TOKEN,
  PAYMENT_BROKER_TOKEN,
  PAYMENT_RETRY_HANDLER_TOKEN,
} from '../workflows/payment-processing/payment.workflow';
import { PaymentEntityService, PaymentState } from '../workflows/payment-processing/payment.entity';

describe('Multi-Workflow Integration E2E', () => {
  let module: TestingModule;
  let orchestrator: OrchestratorService;
  let orderEntityService: OrderEntityService;
  let userEntityService: UserEntityService;
  let paymentEntityService: PaymentEntityService;
  let broker: MockBrokerService;
  let retryHandler: MockRetryHandler;

  beforeEach(async () => {
    broker = new MockBrokerService();
    retryHandler = new MockRetryHandler();
    orderEntityService = new OrderEntityService();
    userEntityService = new UserEntityService();
    paymentEntityService = new PaymentEntityService();

    module = await Test.createTestingModule({
      imports: [
        WorkflowModule.register({
          entities: [
            { provide: ORDER_ENTITY_TOKEN, useValue: orderEntityService },
            { provide: ONBOARDING_ENTITY_TOKEN, useValue: userEntityService },
            { provide: PAYMENT_ENTITY_TOKEN, useValue: paymentEntityService },
          ],
          workflows: [OrderWorkflow, UserOnboardingWorkflow, PaymentWorkflow],
          brokers: [
            { provide: ORDER_BROKER_TOKEN, useValue: broker },
            { provide: ONBOARDING_BROKER_TOKEN, useValue: broker },
            { provide: PAYMENT_BROKER_TOKEN, useValue: broker },
          ],
        }),
      ],
      providers: [{ provide: PAYMENT_RETRY_HANDLER_TOKEN, useValue: retryHandler }],
    }).compile();

    await module.init();
    orchestrator = module.get(OrchestratorService);
  });

  afterEach(async () => {
    orderEntityService.clear();
    userEntityService.clear();
    paymentEntityService.clear();
    broker.clearEvents();
    retryHandler.clearRetries();
    await module.close();
  });

  describe('Multiple Workflows in Same Module', () => {
    test('should handle order and user onboarding workflows simultaneously', async () => {
      // Create order
      const order = await orderEntityService.create();
      order.items = [{ name: 'Product 1', quantity: 1, price: 100 }];
      await orderEntityService.update(order, OrderState.PENDING);

      // Create user
      const user = await userEntityService.create();
      await userEntityService.update(user, OnboardingState.REGISTRATION);

      // Process order
      await orchestrator.transit(createWorkflowEvent(OrderEvent.CREATED, order.id, { approved: true }));
      let updatedOrder = await orderEntityService.load(order.id);
      assertEntityState(updatedOrder!, orderEntityService, OrderState.PROCESSING);

      // Process user onboarding
      await orchestrator.transit(createWorkflowEvent(OnboardingEvent.REGISTERED, user.id));
      let updatedUser = await userEntityService.load(user.id);
      assertEntityState(updatedUser!, userEntityService, OnboardingState.EMAIL_VERIFICATION);

      // Continue order processing
      await orchestrator.transit(createWorkflowEvent(OrderEvent.PROCESSING, order.id));
      updatedOrder = await orderEntityService.load(order.id);
      assertEntityState(updatedOrder!, orderEntityService, OrderState.SHIPPED);

      // Continue user onboarding
      await orchestrator.transit(createWorkflowEvent(OnboardingEvent.EMAIL_VERIFIED, user.id));
      updatedUser = await userEntityService.load(user.id);
      assertEntityState(updatedUser!, userEntityService, OnboardingState.PROFILE_SETUP);
    });

    test('should handle order, user, and payment workflows simultaneously', async () => {
      // Create entities
      const order = await orderEntityService.create();
      order.items = [{ name: 'Product 1', quantity: 1, price: 100 }];
      await orderEntityService.update(order, OrderState.PENDING);

      const user = await userEntityService.create();
      await userEntityService.update(user, OnboardingState.REGISTRATION);

      const payment = await paymentEntityService.create();
      payment.amount = 100;
      await paymentEntityService.update(payment, PaymentState.INITIATED);

      // Process all workflows
      await orchestrator.transit(createWorkflowEvent(OrderEvent.CREATED, order.id, { approved: true }));
      await orchestrator.transit(createWorkflowEvent(OnboardingEvent.REGISTERED, user.id));
      await orchestrator.transit(createWorkflowEvent(PaymentEvent.INITIATED, payment.id, { amount: 100 }));

      // Verify all states
      const updatedOrder = await orderEntityService.load(order.id);
      const updatedUser = await userEntityService.load(user.id);
      const updatedPayment = await paymentEntityService.load(payment.id);

      assertEntityState(updatedOrder!, orderEntityService, OrderState.PROCESSING);
      assertEntityState(updatedUser!, userEntityService, OnboardingState.EMAIL_VERIFICATION);
      assertEntityState(updatedPayment!, paymentEntityService, PaymentState.AUTHORIZING);
    });
  });

  describe('Broker Event Isolation', () => {
    test('should emit events from different workflows to same broker', async () => {
      const order = await orderEntityService.create();
      order.items = [{ name: 'Product 1', quantity: 1, price: 100 }];
      await orderEntityService.update(order, OrderState.PROCESSING);

      const user = await userEntityService.create();
      await userEntityService.update(user, OnboardingState.REGISTRATION);

      // Process both workflows
      await orchestrator.transit(createWorkflowEvent(OrderEvent.PROCESSING, order.id));
      await orchestrator.transit(createWorkflowEvent(OnboardingEvent.REGISTERED, user.id));

      // Verify broker received events from both workflows
      const orderEvents = broker.getEventsByTopic('order.shipment.notification');
      const userEvents = broker.getEventsByTopic('user.email.verification.sent');

      expect(orderEvents.length).toBeGreaterThan(0);
      expect(userEvents.length).toBeGreaterThan(0);
      expect(broker.getEventCount()).toBe(orderEvents.length + userEvents.length);
    });
  });

  describe('Entity Service Isolation', () => {
    test('should maintain separate entity stores for different workflows', async () => {
      const order = await orderEntityService.create();
      const user = await userEntityService.create();
      const payment = await paymentEntityService.create();

      // Verify entities are in separate stores
      expect(await orderEntityService.load(order.id)).toBeDefined();
      expect(await userEntityService.load(user.id)).toBeDefined();
      expect(await paymentEntityService.load(payment.id)).toBeDefined();

      // Verify cross-store access fails
      expect(await orderEntityService.load(user.id)).toBeNull();
      expect(await userEntityService.load(order.id)).toBeNull();
      expect(await paymentEntityService.load(order.id)).toBeNull();
    });
  });

  describe('Concurrent Workflow Execution', () => {
    test('should handle concurrent transitions across different workflows', async () => {
      const order = await orderEntityService.create();
      order.items = [{ name: 'Product 1', quantity: 1, price: 100 }];
      await orderEntityService.update(order, OrderState.PENDING);

      const user = await userEntityService.create();
      await userEntityService.update(user, OnboardingState.REGISTRATION);

      // Execute transitions concurrently
      await Promise.all([
        orchestrator.transit(createWorkflowEvent(OrderEvent.CREATED, order.id, { approved: true })),
        orchestrator.transit(createWorkflowEvent(OnboardingEvent.REGISTERED, user.id)),
      ]);

      // Verify both workflows progressed
      const updatedOrder = await orderEntityService.load(order.id);
      const updatedUser = await userEntityService.load(user.id);

      assertEntityState(updatedOrder!, orderEntityService, OrderState.PROCESSING);
      assertEntityState(updatedUser!, userEntityService, OnboardingState.EMAIL_VERIFICATION);
    });
  });

  describe('Error Isolation', () => {
    test('should isolate errors between different workflows', async () => {
      const order = await orderEntityService.create();
      order.items = []; // Empty items will cause error
      await orderEntityService.update(order, OrderState.PENDING);

      const user = await userEntityService.create();
      await userEntityService.update(user, OnboardingState.REGISTRATION);

      // Order workflow should fail
      await orchestrator.transit(createWorkflowEvent(OrderEvent.CREATED, order.id, { approved: true }));
      const failedOrder = await orderEntityService.load(order.id);
      assertEntityState(failedOrder!, orderEntityService, OrderState.FAILED);

      // User workflow should still work
      await orchestrator.transit(createWorkflowEvent(OnboardingEvent.REGISTERED, user.id));
      const updatedUser = await userEntityService.load(user.id);
      assertEntityState(updatedUser!, userEntityService, OnboardingState.EMAIL_VERIFICATION);
    });
  });

  describe('Workflow Routing', () => {
    test('should route events to correct workflows based on topic', async () => {
      const order = await orderEntityService.create();
      order.items = [{ name: 'Product 1', quantity: 1, price: 100 }];
      await orderEntityService.update(order, OrderState.PENDING);

      const user = await userEntityService.create();
      await userEntityService.update(user, OnboardingState.REGISTRATION);

      // Order event should only affect order workflow
      await orchestrator.transit(createWorkflowEvent(OrderEvent.CREATED, order.id, { approved: true }));

      // User event should only affect user workflow
      await orchestrator.transit(createWorkflowEvent(OnboardingEvent.REGISTERED, user.id));

      // Verify correct workflows were affected
      const updatedOrder = await orderEntityService.load(order.id);
      const updatedUser = await userEntityService.load(user.id);

      assertEntityState(updatedOrder!, orderEntityService, OrderState.PROCESSING);
      assertEntityState(updatedUser!, userEntityService, OnboardingState.EMAIL_VERIFICATION);
    });

    test('should throw error for unknown event topic', async () => {
      await expect(orchestrator.transit(createWorkflowEvent('unknown.event' as any, 'test-id'))).rejects.toThrow();
    });
  });
});
