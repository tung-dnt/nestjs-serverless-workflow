import { Injectable } from '@nestjs/common';
import type { IWorkflowEntity } from '@/core';

export enum SubscriptionState {
  TRIAL = 'trial',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  FAILED = 'failed',
}

export interface Subscription {
  id: string;
  status: SubscriptionState;
  userId: string;
  planId: string;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  paymentMethodId?: string;
  gracePeriodEndsAt?: string;
  cancelledAt?: string;
  expiresAt?: string;
  createdAt?: string;
}

/**
 * In-memory entity service for testing
 */
@Injectable()
export class SubscriptionEntityService implements IWorkflowEntity<Subscription, SubscriptionState> {
  private subscriptions = new Map<string, Subscription>();

  async create(): Promise<Subscription> {
    const subscription: Subscription = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: SubscriptionState.TRIAL,
      userId: `user-${Math.random().toString(36).substr(2, 9)}`,
      planId: 'plan-basic',
      createdAt: new Date().toISOString(),
    };
    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  async load(urn: string | number): Promise<Subscription | null> {
    return this.subscriptions.get(String(urn)) || null;
  }

  async update(subscription: Subscription, status: SubscriptionState): Promise<Subscription> {
    const updated = { ...subscription, status };
    this.subscriptions.set(subscription.id, updated);
    return updated;
  }

  status(subscription: Subscription): SubscriptionState {
    return subscription.status;
  }

  urn(subscription: Subscription): string | number {
    return subscription.id;
  }

  // Test helpers
  clear(): void {
    this.subscriptions.clear();
  }

  getAll(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }
}
