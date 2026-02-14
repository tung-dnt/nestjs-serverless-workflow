import { Injectable } from '@nestjs/common';
import type { IBrokerPublisher, IWorkflowEvent } from '@/event-bus';

/**
 * Mock broker service for testing
 * Tracks all emitted events and allows verification in tests
 */
@Injectable()
export class MockBrokerService implements IBrokerPublisher {
  private emittedEvents: IWorkflowEvent[] = [];
  private shouldFail = false;
  private failureError: Error | null = null;

  async emit(event: IWorkflowEvent): Promise<void> {
    if (this.shouldFail) {
      throw this.failureError || new Error('Mock broker failure');
    }
    this.emittedEvents.push(event);
  }

  /**
   * Get all emitted events
   */
  getEmittedEvents(): IWorkflowEvent[] {
    return [...this.emittedEvents];
  }

  /**
   * Get events by topic
   */
  getEventsByTopic(topic: string): IWorkflowEvent[] {
    return this.emittedEvents.filter((e) => e.topic === topic);
  }

  /**
   * Get events by URN
   */
  getEventsByUrn(urn: string | number): IWorkflowEvent[] {
    return this.emittedEvents.filter((e) => e.urn === urn);
  }

  /**
   * Clear all emitted events
   */
  clearEvents(): void {
    this.emittedEvents = [];
  }

  /**
   * Simulate broker failure
   */
  simulateFailure(error?: Error): void {
    this.shouldFail = true;
    this.failureError = error || null;
  }

  /**
   * Reset failure simulation
   */
  resetFailure(): void {
    this.shouldFail = false;
    this.failureError = null;
  }

  /**
   * Verify event was emitted
   */
  hasEvent(topic: string, urn?: string | number): boolean {
    if (urn) {
      return this.emittedEvents.some((e) => e.topic === topic && e.urn === urn);
    }
    return this.emittedEvents.some((e) => e.topic === topic);
  }

  /**
   * Get count of emitted events
   */
  getEventCount(): number {
    return this.emittedEvents.length;
  }
}
