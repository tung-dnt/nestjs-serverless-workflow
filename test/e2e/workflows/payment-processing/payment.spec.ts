import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { WorkflowModule } from '@/core/workflow.module';
import { OrchestratorService } from '@/core/providers/ochestrator.service';
import { MockBrokerService } from '../../fixtures/mock-broker.service';
import { MockRetryHandler } from '../../fixtures/mock-retry-handler.service';
import { assertEntityState, assertBrokerEvent, createWorkflowEvent } from '../../fixtures/test-helpers';
import {
  PaymentWorkflow,
  PaymentEvent,
  PAYMENT_ENTITY_TOKEN,
  PAYMENT_BROKER_TOKEN,
  PAYMENT_RETRY_HANDLER_TOKEN,
} from './payment.workflow';
import { PaymentEntityService, PaymentState } from './payment.entity';

describe('Payment Processing Workflow E2E', () => {
  let module: TestingModule;
  let orchestrator: OrchestratorService;
  let entityService: PaymentEntityService;
  let broker: MockBrokerService;
  let retryHandler: MockRetryHandler;
  let workflow: PaymentWorkflow;

  beforeEach(async () => {
    broker = new MockBrokerService();
    entityService = new PaymentEntityService();
    retryHandler = new MockRetryHandler();

    module = await Test.createTestingModule({
      imports: [
        WorkflowModule.register({
          entities: [{ provide: PAYMENT_ENTITY_TOKEN, useValue: entityService }],
          workflows: [PaymentWorkflow],
          brokers: [{ provide: PAYMENT_BROKER_TOKEN, useValue: broker }],
        }),
      ],
      providers: [{ provide: PAYMENT_RETRY_HANDLER_TOKEN, useValue: retryHandler }],
    }).compile();

    await module.init();
    orchestrator = module.get(OrchestratorService);
    workflow = module.get(PaymentWorkflow);
  });

  afterEach(async () => {
    entityService.clear();
    broker.clearEvents();
    retryHandler.clearRetries();
    workflow.setSimulateNetworkError(false);
    workflow.setSimulateInvalidCard(false);
    await module.close();
  });

  describe('Happy Path - Successful Payment', () => {
    test('should complete payment flow: INITIATED → AUTHORIZING → CAPTURING → COMPLETED', async () => {
      const payment = await entityService.create();
      payment.amount = 100;
      payment.currency = 'USD';
      await entityService.update(payment, PaymentState.INITIATED);

      // Step 1: Initiate
      await orchestrator.transit(createWorkflowEvent(PaymentEvent.INITIATED, payment.id, { amount: 100 }));
      let updatedPayment = await entityService.load(payment.id);
      assertEntityState(updatedPayment!, entityService, PaymentState.AUTHORIZING);

      // Step 2: Authorize
      await orchestrator.transit(
        createWorkflowEvent(PaymentEvent.AUTHORIZED, payment.id, { cardNumber: '4111-1111-1111-1111' }),
      );
      updatedPayment = await entityService.load(payment.id);
      assertEntityState(updatedPayment!, entityService, PaymentState.CAPTURING);

      // Step 3: Capture
      await orchestrator.transit(createWorkflowEvent(PaymentEvent.CAPTURED, payment.id));
      updatedPayment = await entityService.load(payment.id);
      assertEntityState(updatedPayment!, entityService, PaymentState.COMPLETED);

      // Verify broker event
      assertBrokerEvent(broker, 'payment.completed', payment.id);
    });
  });

  describe('Retry Mechanisms', () => {
    test('should retry on transient network error during authorization', async () => {
      const payment = await entityService.create();
      payment.amount = 100;
      await entityService.update(payment, PaymentState.AUTHORIZING);

      // Simulate network error
      workflow.setSimulateNetworkError(true);

      // First attempt should fail and trigger retry
      try {
        await orchestrator.transit(
          createWorkflowEvent(PaymentEvent.AUTHORIZED, payment.id, { cardNumber: '4111-1111-1111-1111' }),
        );
      } catch (e) {
        // Expected to fail
      }

      // Verify retry was attempted
      expect(retryHandler.getRetryCount()).toBeGreaterThan(0);
    });

    test('should not retry on unretriable error (invalid card)', async () => {
      const payment = await entityService.create();
      payment.amount = 100;
      await entityService.update(payment, PaymentState.AUTHORIZING);

      // Try with invalid card
      await orchestrator.transit(
        createWorkflowEvent(PaymentEvent.AUTHORIZED, payment.id, { cardNumber: '0000-0000-0000-0000' }),
      );

      // Should transition to failed state without retry
      const updatedPayment = await entityService.load(payment.id);
      assertEntityState(updatedPayment!, entityService, PaymentState.FAILED);

      // No retries should have been attempted
      expect(retryHandler.getRetryCount()).toBe(0);
    });

    test('should retry on transient network error during capture', async () => {
      const payment = await entityService.create();
      payment.amount = 100;
      await entityService.update(payment, PaymentState.CAPTURING);

      // Simulate network error
      workflow.setSimulateNetworkError(true);

      // First attempt should fail and trigger retry
      try {
        await orchestrator.transit(createWorkflowEvent(PaymentEvent.CAPTURED, payment.id));
      } catch (e) {
        // Expected to fail
      }

      // Verify retry was attempted
      expect(retryHandler.getRetryCount()).toBeGreaterThan(0);
    });
  });

  describe('Refund Processing', () => {
    test('should refund completed payment', async () => {
      const payment = await entityService.create();
      payment.amount = 100;
      await entityService.update(payment, PaymentState.COMPLETED);

      await orchestrator.transit(createWorkflowEvent(PaymentEvent.REFUNDED, payment.id, { refundId: 'REF-123' }));

      const updatedPayment = await entityService.load(payment.id);
      assertEntityState(updatedPayment!, entityService, PaymentState.REFUNDED);

      // Verify broker event
      assertBrokerEvent(broker, 'payment.refunded', payment.id);
      const events = broker.getEventsByTopic('payment.refunded');
      expect(events[0].payload).toHaveProperty('refundId', 'REF-123');
    });

    test('should not allow refund from non-completed state', async () => {
      const payment = await entityService.create();
      payment.amount = 100;
      await entityService.update(payment, PaymentState.AUTHORIZING);

      // Try to refund from non-completed state
      await expect(orchestrator.transit(createWorkflowEvent(PaymentEvent.REFUNDED, payment.id))).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should transition to FAILED on authorization failure', async () => {
      const payment = await entityService.create();
      payment.amount = 100;
      await entityService.update(payment, PaymentState.AUTHORIZING);

      // Invalid card should cause failure
      await orchestrator.transit(
        createWorkflowEvent(PaymentEvent.AUTHORIZED, payment.id, { cardNumber: '0000-0000-0000-0000' }),
      );

      const updatedPayment = await entityService.load(payment.id);
      assertEntityState(updatedPayment!, entityService, PaymentState.FAILED);
    });

    test('should handle payment failure event', async () => {
      const payment = await entityService.create();
      payment.amount = 100;
      await entityService.update(payment, PaymentState.AUTHORIZING);

      await orchestrator.transit(
        createWorkflowEvent(PaymentEvent.FAILED, payment.id, { errorMessage: 'Authorization declined' }),
      );

      const updatedPayment = await entityService.load(payment.id);
      assertEntityState(updatedPayment!, entityService, PaymentState.FAILED);
    });
  });

  describe('Broker Integration', () => {
    test('should emit payment completed event on capture', async () => {
      const payment = await entityService.create();
      payment.amount = 100;
      await entityService.update(payment, PaymentState.CAPTURING);

      await orchestrator.transit(createWorkflowEvent(PaymentEvent.CAPTURED, payment.id));

      assertBrokerEvent(broker, 'payment.completed', payment.id);
      const events = broker.getEventsByTopic('payment.completed');
      expect(events[0].payload).toHaveProperty('paymentId', payment.id);
      expect(events[0].payload).toHaveProperty('amount', 100);
    });

    test('should emit refund event on refund', async () => {
      const payment = await entityService.create();
      payment.amount = 100;
      await entityService.update(payment, PaymentState.COMPLETED);

      await orchestrator.transit(createWorkflowEvent(PaymentEvent.REFUNDED, payment.id, { refundId: 'REF-456' }));

      assertBrokerEvent(broker, 'payment.refunded', payment.id);
    });
  });

  describe('Idempotency', () => {
    test('should handle duplicate payment requests gracefully', async () => {
      const payment = await entityService.create();
      payment.amount = 100;
      await entityService.update(payment, PaymentState.COMPLETED);

      // Try to process already completed payment
      await expect(orchestrator.transit(createWorkflowEvent(PaymentEvent.INITIATED, payment.id))).rejects.toThrow();
    });
  });
});
