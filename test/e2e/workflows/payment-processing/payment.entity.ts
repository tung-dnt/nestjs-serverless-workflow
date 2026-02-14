import { Injectable } from '@nestjs/common';
import type { IWorkflowEntity } from '@/core';

export enum PaymentState {
  INITIATED = 'initiated',
  AUTHORIZING = 'authorizing',
  CAPTURING = 'capturing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export interface Payment {
  id: string;
  status: PaymentState;
  amount: number;
  currency: string;
  cardNumber?: string;
  authorizationCode?: string;
  captureId?: string;
  refundId?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt?: string;
  completedAt?: string;
  refundedAt?: string;
}

/**
 * In-memory entity service for testing
 */
@Injectable()
export class PaymentEntityService implements IWorkflowEntity<Payment, PaymentState> {
  private payments = new Map<string, Payment>();

  async create(): Promise<Payment> {
    const payment: Payment = {
      id: `payment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: PaymentState.INITIATED,
      amount: 0,
      currency: 'USD',
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.payments.set(payment.id, payment);
    return payment;
  }

  async load(urn: string | number): Promise<Payment | null> {
    return this.payments.get(String(urn)) || null;
  }

  async update(payment: Payment, status: PaymentState): Promise<Payment> {
    const updated = { ...payment, status };
    this.payments.set(payment.id, updated);
    return updated;
  }

  status(payment: Payment): PaymentState {
    return payment.status;
  }

  urn(payment: Payment): string | number {
    return payment.id;
  }

  // Test helpers
  clear(): void {
    this.payments.clear();
  }

  getAll(): Payment[] {
    return Array.from(this.payments.values());
  }
}
