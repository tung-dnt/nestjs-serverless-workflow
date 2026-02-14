import { Injectable } from '@nestjs/common';
import type { IWorkflowEntity } from '@/core';

export enum OrderState {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export interface Order {
  id: string;
  status: OrderState;
  items: Array<{ name: string; quantity: number; price: number }>;
  totalAmount: number;
  customerId: string;
  approved?: boolean;
  shippedAt?: string;
  cancelledAt?: string;
}

/**
 * In-memory entity service for testing
 */
@Injectable()
export class OrderEntityService implements IWorkflowEntity<Order, OrderState> {
  private orders = new Map<string, Order>();

  async create(): Promise<Order> {
    const order: Order = {
      id: `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: OrderState.PENDING,
      items: [],
      totalAmount: 0,
      customerId: `customer-${Math.random().toString(36).substr(2, 9)}`,
    };
    this.orders.set(order.id, order);
    return order;
  }

  async load(urn: string | number): Promise<Order | null> {
    return this.orders.get(String(urn)) || null;
  }

  async update(order: Order, status: OrderState): Promise<Order> {
    const updated = { ...order, status };
    this.orders.set(order.id, updated);
    return updated;
  }

  status(order: Order): OrderState {
    return order.status;
  }

  urn(order: Order): string | number {
    return order.id;
  }

  // Test helpers
  clear(): void {
    this.orders.clear();
  }

  getAll(): Order[] {
    return Array.from(this.orders.values());
  }
}
