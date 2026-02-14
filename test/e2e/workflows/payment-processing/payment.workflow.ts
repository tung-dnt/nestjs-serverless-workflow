import { Inject, Logger } from '@nestjs/common';
import type { IBrokerPublisher } from '@/event-bus';
import { Entity, OnEvent, Payload, Workflow, WithRetry } from '@/core';
import { UnretriableException } from '@/exception';
import { BadRequestException } from '@nestjs/common';

import type { Payment } from './payment.entity';
import { PaymentEntityService, PaymentState } from './payment.entity';

export enum PaymentEvent {
  INITIATED = 'payment.initiated',
  AUTHORIZING = 'payment.authorizing',
  AUTHORIZED = 'payment.authorized',
  CAPTURING = 'payment.capturing',
  CAPTURED = 'payment.captured',
  COMPLETED = 'payment.completed',
  FAILED = 'payment.failed',
  REFUNDED = 'payment.refunded',
}

export const PAYMENT_ENTITY_TOKEN = 'entity.payment';
export const PAYMENT_BROKER_TOKEN = 'broker.payment';
export const PAYMENT_RETRY_HANDLER_TOKEN = 'retry.payment';

@Workflow<Payment, PaymentEvent, PaymentState>({
  name: 'PaymentWorkflow',
  states: {
    finals: [PaymentState.COMPLETED, PaymentState.FAILED, PaymentState.REFUNDED],
    idles: [PaymentState.INITIATED, PaymentState.AUTHORIZING, PaymentState.CAPTURING],
    failed: PaymentState.FAILED,
  },
  transitions: [
    {
      event: PaymentEvent.INITIATED,
      from: [PaymentState.INITIATED],
      to: PaymentState.AUTHORIZING,
    },
    {
      event: PaymentEvent.AUTHORIZED,
      from: [PaymentState.AUTHORIZING],
      to: PaymentState.CAPTURING,
    },
    {
      event: PaymentEvent.CAPTURED,
      from: [PaymentState.CAPTURING],
      to: PaymentState.COMPLETED,
    },
    {
      event: PaymentEvent.FAILED,
      from: [PaymentState.AUTHORIZING, PaymentState.CAPTURING],
      to: PaymentState.FAILED,
    },
    {
      event: PaymentEvent.REFUNDED,
      from: [PaymentState.COMPLETED],
      to: PaymentState.REFUNDED,
    },
  ],
  entityService: PAYMENT_ENTITY_TOKEN,
  brokerPublisher: PAYMENT_BROKER_TOKEN,
})
export class PaymentWorkflow {
  private readonly logger = new Logger(PaymentWorkflow.name);
  private simulateNetworkError = false;
  private simulateInvalidCard = false;

  constructor(
    @Inject(PAYMENT_BROKER_TOKEN)
    private readonly brokerPublisher: IBrokerPublisher,
  ) {}

  // For testing: simulate errors
  setSimulateNetworkError(value: boolean): void {
    this.simulateNetworkError = value;
  }

  setSimulateInvalidCard(value: boolean): void {
    this.simulateInvalidCard = value;
  }

  @OnEvent(PaymentEvent.INITIATED)
  async handleInitiated(@Entity() payment: Payment, @Payload() payload: any) {
    this.logger.log(`Payment ${payment.id} initiated`);
    return { amount: payload?.amount || payment.amount, cardNumber: payload?.cardNumber };
  }

  @OnEvent(PaymentEvent.AUTHORIZED)
  @WithRetry({
    handler: PAYMENT_RETRY_HANDLER_TOKEN,
    maxAttempts: 3,
    strategy: 'exponential_jitter' as any,
    initialDelay: 100,
    backoffMultiplier: 2,
    maxDelay: 1000,
    jitter: true,
  })
  async handleAuthorizing(@Entity() payment: Payment, @Payload() payload: any) {
    this.logger.log(`Authorizing payment ${payment.id}`);

    // Simulate invalid card (unretriable)
    if (this.simulateInvalidCard || payload?.cardNumber === '0000-0000-0000-0000') {
      throw new UnretriableException('Invalid card number');
    }

    // Simulate network error (retriable)
    if (this.simulateNetworkError) {
      throw new Error('Network error during authorization');
    }

    return { authorizationCode: `AUTH-${Date.now()}` };
  }

  @OnEvent(PaymentEvent.CAPTURED)
  @WithRetry({
    handler: PAYMENT_RETRY_HANDLER_TOKEN,
    maxAttempts: 3,
    strategy: 'exponential' as any,
    initialDelay: 100,
    backoffMultiplier: 2,
    maxDelay: 1000,
  })
  async handleCapturing(@Entity() payment: Payment, @Payload() payload: any) {
    this.logger.log(`Capturing payment ${payment.id}`);

    // Simulate network error (retriable)
    if (this.simulateNetworkError) {
      throw new Error('Network error during capture');
    }

    await this.brokerPublisher.emit({
      topic: 'payment.completed',
      urn: payment.id,
      attempt: 0,
      payload: { paymentId: payment.id, amount: payment.amount },
    });

    return { captureId: `CAPTURE-${Date.now()}` };
  }

  @OnEvent(PaymentEvent.COMPLETED)
  async handleCompleted(@Entity() payment: Payment) {
    this.logger.log(`Payment ${payment.id} completed`);
    return { completedAt: new Date().toISOString() };
  }

  @OnEvent(PaymentEvent.FAILED)
  async handleFailed(@Entity() payment: Payment, @Payload() payload: any) {
    this.logger.log(`Payment ${payment.id} failed: ${payload?.errorMessage || 'Unknown error'}`);
    return { errorMessage: payload?.errorMessage };
  }

  @OnEvent(PaymentEvent.REFUNDED)
  async handleRefunded(@Entity() payment: Payment, @Payload() payload: any) {
    this.logger.log(`Payment ${payment.id} refunded`);
    await this.brokerPublisher.emit({
      topic: 'payment.refunded',
      urn: payment.id,
      attempt: 0,
      payload: { paymentId: payment.id, refundId: payload?.refundId },
    });
    return { refundedAt: new Date().toISOString(), refundId: payload?.refundId };
  }
}
